import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import axios from 'axios';
import {
  Location,
  PropertyType,
  Feature,
  FeatureCategory,
} from '../../database/entities';
import { AiService, ENRICHMENT_MODEL } from '../ai/ai.service';
import { LocationService } from '../location/location.service';
import { PropertyTypeService } from '../property-type/property-type.service';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Result counters surfaced back to the dashboard so users can see what AI
// did on a given run.
export interface EnrichmentResult {
  locations: {
    regionsCreated: number;
    provincesAttached: number;
    skipped: number;
    // Duplicate area nodes folded into their canonical province (e.g. a second
    // "Costa del Sol" imported under Cádiz merged into the Málaga one).
    areasMerged: number;
  };
  propertyTypes: {
    parentsCreated: number;
    childrenAttached: number;
    // Duplicate type rows folded into the one holding the listings (e.g. an
    // imported "Apartments" merged into "Apartment").
    typesMerged: number;
    // Types lifted back to top level because the model says they don't belong
    // under the parent a previous run gave them.
    detached: number;
    skipped: number;
  };
  features: { recategorised: number; skipped: number };
  errors: string[];
}

// What the model returns for a property-type organise pass.
interface TypeOrganisation {
  // Canonical name → names that mean the same kind of property.
  merges?: Record<string, string[]>;
  // Parent name → the subtypes that belong under it.
  groups?: Record<string, string[]>;
  // Types that are currently nested but belong at top level. Must be explicit:
  // omission always means "leave it where it is".
  root?: string[];
}

@Injectable()
export class AiEnrichmentService {
  private readonly logger = new Logger(AiEnrichmentService.name);

  constructor(
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    private readonly aiService: AiService,
    // Reused for its merge semantics: bulkMove folds a moved node into a
    // same-slug sibling under the target parent, carrying properties and
    // children across. Reimplementing that here would duplicate the recursion.
    private readonly locationService: LocationService,
    // Same reasoning for property types: merge() re-points listings and child
    // types onto the survivor before deleting the duplicate row.
    private readonly propertyTypeService: PropertyTypeService,
  ) {}

  // Runs all three enrichments in sequence. Each is idempotent — rows the
  // user manually edited (aiAssigned=false but already correctly grouped)
  // stay untouched. AI-set rows can be re-evaluated freely.
  async enrichAll(tenantId: number): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
      locations: { regionsCreated: 0, provincesAttached: 0, skipped: 0, areasMerged: 0 },
      propertyTypes: { parentsCreated: 0, childrenAttached: 0, typesMerged: 0, detached: 0, skipped: 0 },
      features: { recategorised: 0, skipped: 0 },
      errors: [],
    };

    try {
      result.locations = await this.enrichLocations(tenantId);
    } catch (err) {
      this.logger.error(`enrichLocations failed for tenant=${tenantId}`, err);
      result.errors.push(`locations: ${(err as Error).message}`);
    }

    try {
      result.propertyTypes = await this.enrichPropertyTypes(tenantId);
    } catch (err) {
      this.logger.error(`enrichPropertyTypes failed for tenant=${tenantId}`, err);
      result.errors.push(`propertyTypes: ${(err as Error).message}`);
    }

    try {
      result.features = await this.enrichFeatures(tenantId);
    } catch (err) {
      this.logger.error(`enrichFeatures failed for tenant=${tenantId}`, err);
      result.errors.push(`features: ${(err as Error).message}`);
    }

    return result;
  }

  // Fills the Region level (e.g. Andalucía) above provinces. Resales doesn't
  // send region — AI maps province → autonomous community based on geographic
  // knowledge.
  async enrichLocations(tenantId: number): Promise<EnrichmentResult['locations']> {
    // Runs first and independently of the region pass below: a tenant can have
    // duplicate areas without having any orphan provinces, and vice versa.
    const areasMerged = await this.mergeDuplicateAreas(tenantId);

    const orphanProvinces = await this.locationRepository.find({
      where: { tenantId, level: 'province', parentId: IsNull() },
    });

    if (orphanProvinces.length === 0) {
      return { regionsCreated: 0, provincesAttached: 0, skipped: 0, areasMerged };
    }

    const provinceNames = orphanProvinces.map((p) => p.name?.en || '').filter(Boolean);
    const mapping = await this.askAiForRegions(tenantId, provinceNames);
    if (!mapping) {
      return { regionsCreated: 0, provincesAttached: 0, skipped: orphanProvinces.length, areasMerged };
    }

    let regionsCreated = 0;
    let provincesAttached = 0;
    let skipped = 0;

    // Cache region-name → region-id per run so multiple provinces share one node.
    const regionCache = new Map<string, number>();

    for (const province of orphanProvinces) {
      const provinceName = province.name?.en || '';
      const regionName = mapping[provinceName];
      if (!regionName) {
        skipped++;
        continue;
      }

      let regionId = regionCache.get(regionName.toLowerCase());
      if (!regionId) {
        const slug = this.slugify(regionName);
        let region = await this.locationRepository.findOne({
          where: { tenantId, slug, parentId: IsNull() },
        });
        if (!region) {
          region = await this.locationRepository.save(
            this.locationRepository.create({
              tenantId,
              name: { en: regionName, es: regionName },
              slug,
              level: 'region',
              parentId: null,
              aiAssigned: true,
            }),
          );
          regionsCreated++;
        }
        regionId = region.id;
        regionCache.set(regionName.toLowerCase(), regionId);
      }

      await this.locationRepository.update(province.id, {
        parentId: regionId,
        aiAssigned: true,
      });
      provincesAttached++;
    }

    return { regionsCreated, provincesAttached, skipped, areasMerged };
  }

  // Folds duplicate area nodes into one canonical parent.
  //
  // Feeds describe each property's hierarchy on its own row and send no ID for
  // Province/Area, so a single property claiming `Cádiz / Costa del Sol`
  // creates a second "Costa del Sol" next to the real one under Málaga. The
  // static DEFAULT_AREA_PROVINCE map in @spm/shared prevents this for the
  // Spanish costas we know; this pass is the general case — it catches areas
  // that map doesn't cover, and works for any country a future client imports
  // from, because the geography comes from the model rather than a hardcoded
  // list.
  //
  // Deliberately only acts on DUPLICATES. A single misparented area produces no
  // visible symptom and gives us no signal to judge against, so guessing there
  // would risk moving correct data.
  private async mergeDuplicateAreas(tenantId: number): Promise<number> {
    const areas = await this.locationRepository.find({
      where: { tenantId, level: 'area' },
    });
    if (areas.length < 2) return 0;

    // Group by slug; only slugs appearing under 2+ distinct parents are suspect.
    const bySlug = new Map<string, Location[]>();
    for (const area of areas) {
      if (!area.slug) continue;
      const list = bySlug.get(area.slug) || [];
      list.push(area);
      bySlug.set(area.slug, list);
    }

    const duplicates = [...bySlug.values()].filter((list) => {
      const parents = new Set(list.map((a) => a.parentId));
      return list.length > 1 && parents.size > 1;
    });
    if (duplicates.length === 0) return 0;

    // Build "<Area>": ["<Province A>", "<Province B>"] for the prompt.
    const provinceIds = new Set<number>();
    for (const list of duplicates) {
      for (const a of list) if (a.parentId != null) provinceIds.add(a.parentId);
    }
    const provinces = provinceIds.size
      ? await this.locationRepository.find({ where: { tenantId, id: In([...provinceIds]) } })
      : [];
    const provinceNameById = new Map(provinces.map((p) => [p.id, p.name?.en || '']));

    const question: Record<string, string[]> = {};
    for (const list of duplicates) {
      const areaName = list[0].name?.en || '';
      if (!areaName) continue;
      const options = list
        .map((a) => (a.parentId != null ? provinceNameById.get(a.parentId) || '' : ''))
        .filter(Boolean);
      if (options.length > 1) question[areaName] = options;
    }
    if (Object.keys(question).length === 0) return 0;

    const verdict = await this.askAiForCanonicalAreaProvince(tenantId, question);
    if (!verdict) return 0;

    let merged = 0;
    for (const list of duplicates) {
      const areaName = list[0].name?.en || '';
      const canonicalProvince = verdict[areaName];
      // AI omits (or returns empty for) areas that legitimately span provinces
      // — Costa de la Luz covers both Huelva and Cádiz. Leave those alone.
      if (!canonicalProvince) continue;

      const keeper = list.find(
        (a) =>
          a.parentId != null &&
          (provinceNameById.get(a.parentId) || '').toLowerCase() ===
            canonicalProvince.toLowerCase(),
      );
      // The model named a province none of the duplicates actually sit under —
      // don't invent a node for it, just skip.
      if (!keeper || keeper.parentId == null) continue;

      const losers = list.filter((a) => a.id !== keeper.id).map((a) => a.id);
      if (losers.length === 0) continue;

      // bulkMove folds each loser into the same-slug sibling under the target
      // parent, moving its properties and children across and deleting the
      // emptied node.
      const result = await this.locationService.bulkMove(tenantId, losers, keeper.parentId);
      merged += result.merged;
    }

    return merged;
  }

  // Tidies the property-type list: folds duplicate rows together, then nests
  // subtypes under the broad type they belong to (Detached Villa → Villas).
  //
  // Looks at EVERY type, not just the orphans, so a re-run can correct a
  // parent an earlier run got wrong. What it will never touch is a row the
  // user arranged themselves — aiAssigned=false with a parent set. Those are
  // "locked": not moved, not detached, not merged away. Everything else is
  // fair game, because it was either left flat by the feed importer or put
  // there by a previous AI run.
  async enrichPropertyTypes(tenantId: number): Promise<EnrichmentResult['propertyTypes']> {
    const empty = { parentsCreated: 0, childrenAttached: 0, typesMerged: 0, detached: 0, skipped: 0 };

    const all = await this.propertyTypeRepository.find({ where: { tenantId } });
    if (all.length < 2) return empty;

    const counts = await this.countPropertiesByType(tenantId);
    const answer = await this.askAiForTypeOrganisation(tenantId, all, counts);
    if (!answer) return { ...empty, skipped: all.length };

    const typesMerged = await this.applyTypeMerges(tenantId, all, counts, answer.merges);

    // Merges delete rows, so re-read before grouping rather than working from
    // a list that still contains them.
    const survivors = typesMerged > 0
      ? await this.propertyTypeRepository.find({ where: { tenantId } })
      : all;

    const grouped = await this.applyTypeGroups(tenantId, survivors, answer);
    return { ...grouped, typesMerged };
  }

  // A type is locked when the user put it under a parent themselves. The feed
  // importer leaves types flat, and AI runs stamp aiAssigned=true, so this
  // combination only happens through a manual edit.
  private isLockedType(type: PropertyType): boolean {
    return type.parentId != null && !type.aiAssigned;
  }

  private async countPropertiesByType(tenantId: number): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    try {
      const rows: Array<{ propertyTypeId: number; cnt: string }> =
        await this.propertyTypeRepository.manager.query(
          `SELECT propertyTypeId, COUNT(*) AS cnt
           FROM properties
           WHERE tenantId = ? AND propertyTypeId IS NOT NULL
           GROUP BY propertyTypeId`,
          [tenantId],
        );
      for (const row of rows || []) {
        counts.set(Number(row.propertyTypeId), parseInt(row.cnt, 10) || 0);
      }
    } catch (err) {
      // Counts only influence which duplicate survives; a failure here should
      // degrade the pass, not abort it.
      this.logger.warn(`Property counts unavailable for tenant=${tenantId}: ${(err as Error).message}`);
    }
    return counts;
  }

  private async applyTypeMerges(
    tenantId: number,
    all: PropertyType[],
    counts: Map<number, number>,
    merges: TypeOrganisation['merges'],
  ): Promise<number> {
    if (!merges || typeof merges !== 'object') return 0;

    const byName = new Map(all.map((t) => [this.normaliseName(t.name?.en), t]));
    const consumed = new Set<number>();
    let merged = 0;

    for (const [canonicalName, duplicateNames] of Object.entries(merges)) {
      if (!Array.isArray(duplicateNames) || duplicateNames.length === 0) continue;

      const names = [canonicalName, ...duplicateNames].map((n) => this.normaliseName(n));
      const rows = names.map((n) => byName.get(n)).filter((t): t is PropertyType => !!t);
      // A name that resolves to nothing means the model invented or reworded a
      // type. Can't tell which pairing it meant, so drop the whole group.
      if (rows.length !== names.length) continue;

      const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
      if (unique.length < 2) continue;
      if (unique.some((r) => consumed.has(r.id) || this.isLockedType(r))) continue;

      // Parent and child are a hierarchy someone built, not a duplicate pair —
      // merging them would delete a level of the tree.
      const ids = new Set(unique.map((r) => r.id));
      if (unique.some((r) => r.parentId != null && ids.has(r.parentId))) continue;

      // The survivor is the row with the listings, not the name the model
      // preferred: that row is the one feeds and public URLs already point at.
      const keeper = [...unique].sort(
        (a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.id - b.id,
      )[0];
      const losers = unique.filter((r) => r.id !== keeper.id).map((r) => r.id);

      try {
        const result = await this.propertyTypeService.merge(tenantId, losers, keeper.id);
        merged += result.mergedTypes;
        for (const r of unique) consumed.add(r.id);
      } catch (err) {
        this.logger.warn(
          `Merging property types [${losers.join(', ')}] into ${keeper.id} failed: ${(err as Error).message}`,
        );
      }
    }

    return merged;
  }

  private async applyTypeGroups(
    tenantId: number,
    types: PropertyType[],
    answer: TypeOrganisation,
  ): Promise<Omit<EnrichmentResult['propertyTypes'], 'typesMerged'>> {
    const groups = answer.groups && typeof answer.groups === 'object' ? answer.groups : {};
    const byName = new Map(types.map((t) => [this.normaliseName(t.name?.en), t]));
    const byId = new Map(types.map((t) => [t.id, t]));

    let parentsCreated = 0;
    let childrenAttached = 0;
    let detached = 0;
    let skipped = 0;

    for (const [parentName, childNames] of Object.entries(groups)) {
      if (!Array.isArray(childNames) || childNames.length < 2) continue;

      const normalisedParent = this.normaliseName(parentName);
      const children = childNames
        .map((n) => byName.get(this.normaliseName(n)))
        .filter((t): t is PropertyType => !!t && this.normaliseName(t.name?.en) !== normalisedParent);
      // Two members is what makes it a group; one is just a rename.
      if (children.length < 2) continue;

      const movable = children.filter((c) => !this.isLockedType(c));
      skipped += children.length - movable.length;
      if (movable.length === 0) continue;

      const parent = await this.findOrCreateTypeParent(tenantId, parentName, byName, byId);
      if (parent.created) parentsCreated++;

      for (const child of movable) {
        if (child.id === parent.row.id) {
          skipped++;
          continue;
        }
        if (child.parentId === parent.row.id) continue; // already in place
        // The parent may itself sit under one of these children from an earlier
        // run — attaching would make the child its own ancestor.
        if (this.isDescendantType(byId, parent.row.id, child.id)) {
          skipped++;
          continue;
        }

        await this.propertyTypeRepository.update(child.id, {
          parentId: parent.row.id,
          aiAssigned: true,
        });
        child.parentId = parent.row.id;
        childrenAttached++;
      }
    }

    // Lifting a type back to top level needs an explicit mention in `root`.
    // Treating omission as "detach" would flatten the whole tree the moment a
    // response came back truncated.
    const rootNames = new Set(
      (Array.isArray(answer.root) ? answer.root : []).map((n) => this.normaliseName(n)),
    );
    for (const type of types) {
      if (type.parentId == null) continue;
      if (this.isLockedType(type)) continue;
      if (!rootNames.has(this.normaliseName(type.name?.en))) continue;

      await this.propertyTypeRepository.update(type.id, { parentId: null, aiAssigned: true });
      type.parentId = null;
      detached++;
    }

    return { parentsCreated, childrenAttached, detached, skipped };
  }

  private async findOrCreateTypeParent(
    tenantId: number,
    parentName: string,
    byName: Map<string, PropertyType>,
    byId: Map<number, PropertyType>,
  ): Promise<{ row: PropertyType; created: boolean }> {
    const existingByName = byName.get(this.normaliseName(parentName));
    if (existingByName) return { row: existingByName, created: false };

    const slug = this.slugify(parentName);
    const existingBySlug = await this.propertyTypeRepository.findOne({ where: { tenantId, slug } });
    if (existingBySlug) {
      byName.set(this.normaliseName(parentName), existingBySlug);
      byId.set(existingBySlug.id, existingBySlug);
      return { row: existingBySlug, created: false };
    }

    const row = await this.propertyTypeRepository.save(
      this.propertyTypeRepository.create({
        tenantId,
        name: { en: parentName, es: parentName },
        slug,
        aiAssigned: true,
      }),
    );
    // Registered immediately so a later group in the same run reuses it.
    byName.set(this.normaliseName(parentName), row);
    byId.set(row.id, row);
    return { row, created: true };
  }

  // True when `candidateId` sits anywhere below `ancestorId` in the tree.
  private isDescendantType(
    byId: Map<number, PropertyType>,
    candidateId: number,
    ancestorId: number,
  ): boolean {
    let current = byId.get(candidateId);
    const seen = new Set<number>();
    while (current?.parentId != null) {
      if (current.parentId === ancestorId) return true;
      if (seen.has(current.parentId)) return false; // pre-existing cycle
      seen.add(current.parentId);
      current = byId.get(current.parentId);
    }
    return false;
  }

  private normaliseName(name?: string | null): string {
    return (name || '').trim().toLowerCase();
  }

  // Recategorises features currently in 'other'. Respects user edits — only
  // touches rows where aiAssigned=true OR category='other' (the import default).
  async enrichFeatures(tenantId: number): Promise<EnrichmentResult['features']> {
    const candidates = await this.featureRepository.find({
      where: { tenantId, category: 'other' as FeatureCategory },
    });

    if (candidates.length === 0) {
      return { recategorised: 0, skipped: 0 };
    }

    const names = candidates.map((f) => f.name?.en || '').filter(Boolean);
    const mapping = await this.askAiForFeatureCategories(tenantId, names);
    if (!mapping) return { recategorised: 0, skipped: candidates.length };

    let recategorised = 0;
    let skipped = 0;
    const validCategories: FeatureCategory[] = ['interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other'];

    for (const feature of candidates) {
      const enName = feature.name?.en || '';
      const newCategory = mapping[enName] as FeatureCategory | undefined;
      if (!newCategory || newCategory === 'other' || !validCategories.includes(newCategory)) {
        skipped++;
        continue;
      }
      await this.featureRepository.update(feature.id, {
        category: newCategory,
        aiAssigned: true,
      });
      recategorised++;
    }

    return { recategorised, skipped };
  }

  // ============ AI calls ============

  private async askAiForRegions(tenantId: number, provinces: string[]): Promise<Record<string, string> | null> {
    const prompt = `For each Spanish province below, return the autonomous community (Comunidad Autónoma) it belongs to.

Provinces:
${provinces.map((p) => `- ${p}`).join('\n')}

Reply ONLY with valid JSON in this exact shape (no markdown, no commentary):
{ "<ProvinceName>": "<AutonomousCommunityName>", ... }

Use the Spanish name for the community (e.g. "Andalucía", "Comunidad de Madrid", "Cataluña"). If a name is not a Spanish province, omit it from the output.`;

    return this.callOpenRouterJson(tenantId, prompt);
  }

  // Asks which province an area really belongs to when the feed has filed it
  // under several. Must be allowed to answer "neither" — some areas genuinely
  // span provinces, and a forced pick there would misfile real properties.
  private async askAiForCanonicalAreaProvince(
    tenantId: number,
    candidates: Record<string, string[]>,
  ): Promise<Record<string, string> | null> {
    const lines = Object.entries(candidates)
      .map(([area, provinces]) => `- "${area}": currently filed under ${provinces.map((p) => `"${p}"`).join(' and ')}`)
      .join('\n');

    const prompt = `Each real-estate AREA below has been imported under more than one PROVINCE, which usually means the property feed mislabelled some listings. For each area, decide which ONE province it canonically belongs to.

${lines}

Rules:
- Answer with one of the provinces listed for that area. Do not invent a different province.
- If the area GENUINELY spans more than one of the listed provinces (for example a coastline crossing a provincial border), OMIT that area from your answer entirely. Do not guess.
- Judge by real geography, not by which name appears first.

Reply ONLY with valid JSON (no markdown, no commentary):
{ "<AreaName>": "<ProvinceName>", ... }

Return {} if none of them can be resolved confidently.`;

    return this.callOpenRouterJson(tenantId, prompt);
  }

  // Asks for one organisation pass over the whole type list: duplicates to
  // fold together, subtypes to nest, and types that were nested wrongly.
  // Sends the current tree and listing counts so the model can tell a real
  // duplicate from a subtype, and knows which rows it is not allowed to move.
  private async askAiForTypeOrganisation(
    tenantId: number,
    types: PropertyType[],
    counts: Map<number, number>,
  ): Promise<TypeOrganisation | null> {
    const nameById = new Map(types.map((t) => [t.id, t.name?.en || '']));

    const lines = types
      .filter((t) => (t.name?.en || '').trim())
      .map((t) => {
        const parts = [`"${t.name!.en}"`, `${counts.get(t.id) || 0} listings`];
        parts.push(
          t.parentId != null
            ? `currently under "${nameById.get(t.parentId) || 'unknown'}"`
            : 'currently top level',
        );
        if (this.isLockedType(t)) parts.push('[locked]');
        return `- ${parts.join(' — ')}`;
      })
      .join('\n');

    const prompt = `You are tidying the property-type list of a real-estate website. These types come from imported feeds, so the same kind of property often appears more than once under slightly different names, and subtypes usually sit flat next to the broad type they belong to.

These are Spanish / Mediterranean property listings. Several type names mean something different here than in UK or US real estate, and the local meaning is the correct one:
- "Duplex" (dúplex) is an APARTMENT spread over two floors — it belongs under Apartments, NOT under Townhouses. It does not mean a two-unit building.
- "Penthouse" (ático) and "Ground Floor Apartment" (bajo) are Apartments.
- "Bungalow" in coastal listings is usually a single-storey apartment or a small terraced unit, not a detached house.
- "Townhouse" (adosado / casa adosada) is a house sharing side walls — a Townhouse, not an Apartment.
- "Finca", "Cortijo" and "Country House" are Country Properties.
- "Plot", "Land" and "Residential Plot" are Plots — never nest them under a building type.

Property types:
${lines}

Reply ONLY with valid JSON (no markdown, no commentary):
{
  "merges": { "<CanonicalName>": ["<DuplicateName>", ...] },
  "groups": { "<ParentName>": ["<ChildName>", "<ChildName>", ...] },
  "root": ["<TypeName>", ...]
}

Rules for "merges":
- Only names meaning EXACTLY the same kind of property: singular/plural ("Apartment" / "Apartments"), spelling variants, or direct synonyms ("Flat" / "Apartment").
- A narrower type is NEVER a duplicate of a broader one. "Penthouse" is not a duplicate of "Apartment"; "Detached Villa" is not a duplicate of "Villa".
- Omit "merges" entirely if nothing is a true duplicate. Merging is destructive — when unsure, leave it out.

Rules for "groups":
- Nest subtypes under the broad type they belong to, e.g. "Villas": ["Detached Villa", "Semi-Detached Villa"].
- A parent may be a name already in the list, or a new one you invent ("Villas", "Apartments", "Townhouses", "Penthouses", "Plots", "Commercial", "Country Properties").
- A parent needs at least 2 children. No type may appear under two parents, or as both a parent and a child.

Rules for "root":
- List ONLY types that are currently nested under a parent they do not belong to and should sit at top level instead.
- Leaving a type out of your answer always means "leave it exactly where it is". Never use omission to mean "move it".

Types marked [locked] were arranged by the user. You may name one as a parent, but never list one as a child, in "root", or anywhere in "merges".

Use type names exactly as written above. Return {} if nothing needs changing.`;

    return this.callOpenRouterJson(tenantId, prompt) as Promise<TypeOrganisation | null>;
  }

  private async askAiForFeatureCategories(tenantId: number, features: string[]): Promise<Record<string, string> | null> {
    const prompt = `Categorise each real-estate feature into ONE of these categories:
- interior   (e.g. Fireplace, Fitted Wardrobes, Marble Floors)
- exterior   (e.g. Garden, Terrace, Balcony, Close To Sea)
- community  (e.g. Communal Pool, Tennis Court, Concierge, Gated Community)
- climate    (e.g. Air Conditioning, Central Heating, Underfloor Heating)
- views      (e.g. Sea View, Mountain View, Panoramic View)
- security   (e.g. Alarm System, 24h Security, Entry Phone)
- parking    (e.g. Garage, Underground Parking, Covered Parking)
- other      (use sparingly — only if none of the above fit)

Features:
${features.map((f) => `- ${f}`).join('\n')}

Reply ONLY with valid JSON (no markdown, no commentary):
{ "<FeatureName>": "<category>", ... }

Use the exact category strings above (lowercase).`;

    return this.callOpenRouterJson(tenantId, prompt);
  }

  // Single thin wrapper around OpenRouter for enrichment work. Resolves a
  // key via AiService (tenant override → platform key), uses Haiku 4.5 for
  // cost/speed, parses JSON from the response. Returns null on failure so
  // callers can skip gracefully instead of crashing the import.
  private async callOpenRouterJson(tenantId: number, prompt: string): Promise<Record<string, any> | null> {
    const resolved = await this.aiService.resolveBackgroundKey(tenantId, ENRICHMENT_MODEL);
    if (!resolved) {
      this.logger.warn(`No OpenRouter key for tenant=${tenantId} (and no platform key set) — skipping enrichment`);
      return null;
    }

    try {
      const response = await axios.post(
        OPENROUTER_URL,
        {
          model: resolved.model,
          messages: [
            { role: 'system', content: 'You are a precise data classifier. Reply with valid JSON only.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        },
        {
          headers: {
            Authorization: `Bearer ${resolved.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://spw-ai.com',
            'X-Title': 'SPW Enrichment',
          },
          timeout: 60_000,
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) return null;

      // Tolerate models that wrap JSON in markdown code fences despite
      // response_format hint.
      const stripped = String(content).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(stripped);
    } catch (err) {
      this.logger.warn(`OpenRouter enrichment call failed: ${(err as Error).message}`);
      return null;
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
