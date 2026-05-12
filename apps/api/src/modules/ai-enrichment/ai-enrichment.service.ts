import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import axios from 'axios';
import {
  Location,
  PropertyType,
  Feature,
  FeatureCategory,
} from '../../database/entities';
import { AiService, ENRICHMENT_MODEL } from '../ai/ai.service';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Result counters surfaced back to the dashboard so users can see what AI
// did on a given run.
export interface EnrichmentResult {
  locations: { regionsCreated: number; provincesAttached: number; skipped: number };
  propertyTypes: { parentsCreated: number; childrenAttached: number; skipped: number };
  features: { recategorised: number; skipped: number };
  errors: string[];
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
  ) {}

  // Runs all three enrichments in sequence. Each is idempotent — rows the
  // user manually edited (aiAssigned=false but already correctly grouped)
  // stay untouched. AI-set rows can be re-evaluated freely.
  async enrichAll(tenantId: number): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
      locations: { regionsCreated: 0, provincesAttached: 0, skipped: 0 },
      propertyTypes: { parentsCreated: 0, childrenAttached: 0, skipped: 0 },
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
    const orphanProvinces = await this.locationRepository.find({
      where: { tenantId, level: 'province', parentId: IsNull() },
    });

    if (orphanProvinces.length === 0) {
      return { regionsCreated: 0, provincesAttached: 0, skipped: 0 };
    }

    const provinceNames = orphanProvinces.map((p) => p.name?.en || '').filter(Boolean);
    const mapping = await this.askAiForRegions(tenantId, provinceNames);
    if (!mapping) return { regionsCreated: 0, provincesAttached: 0, skipped: orphanProvinces.length };

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

    return { regionsCreated, provincesAttached, skipped };
  }

  // Groups obvious property-type subtypes under broader parents
  // (e.g. Detached Villa + Semi-Detached Villa → Villas). Conservative — only
  // groups when subtype clearly belongs to a single parent. Leaves the rest
  // flat for the user to handle.
  async enrichPropertyTypes(tenantId: number): Promise<EnrichmentResult['propertyTypes']> {
    const ungrouped = await this.propertyTypeRepository.find({
      where: { tenantId, parentId: IsNull() },
    });

    if (ungrouped.length < 2) {
      return { parentsCreated: 0, childrenAttached: 0, skipped: 0 };
    }

    const typeNames = ungrouped.map((t) => t.name?.en || '').filter(Boolean);
    const grouping = await this.askAiForTypeGroupings(tenantId, typeNames);
    if (!grouping) return { parentsCreated: 0, childrenAttached: 0, skipped: ungrouped.length };

    let parentsCreated = 0;
    let childrenAttached = 0;
    let skipped = 0;

    // grouping: { "Villas": ["Detached Villa", "Semi-Detached Villa", ...], ... }
    for (const [parentName, childNames] of Object.entries(grouping)) {
      if (!Array.isArray(childNames) || childNames.length < 2) {
        // No real group — skip
        continue;
      }
      // Don't auto-create a parent that's identical to one of its children
      // (the AI shouldn't do this but guard anyway).
      const lowerParent = parentName.toLowerCase();
      const safeChildren = childNames.filter((c) => c.toLowerCase() !== lowerParent);
      if (safeChildren.length < 2) continue;

      const parentSlug = this.slugify(parentName);
      let parent = await this.propertyTypeRepository.findOne({
        where: { tenantId, slug: parentSlug },
      });
      if (!parent) {
        parent = await this.propertyTypeRepository.save(
          this.propertyTypeRepository.create({
            tenantId,
            name: { en: parentName, es: parentName },
            slug: parentSlug,
            aiAssigned: true,
          }),
        );
        parentsCreated++;
      }

      for (const childName of safeChildren) {
        const child = ungrouped.find((t) => (t.name?.en || '').toLowerCase() === childName.toLowerCase());
        if (!child || child.id === parent.id) {
          skipped++;
          continue;
        }
        await this.propertyTypeRepository.update(child.id, {
          parentId: parent.id,
          aiAssigned: true,
        });
        childrenAttached++;
      }
    }

    return { parentsCreated, childrenAttached, skipped };
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

  private async askAiForTypeGroupings(tenantId: number, types: string[]): Promise<Record<string, string[]> | null> {
    const prompt = `Group these real-estate property types into broad parent categories. Only group types that clearly share a parent (e.g. "Detached Villa" and "Semi-Detached Villa" → "Villas"). Leave singletons un-grouped (do not include them in the output).

Property types:
${types.map((t) => `- ${t}`).join('\n')}

Common parent categories to use: "Villas", "Apartments", "Townhouses", "Penthouses", "Plots", "Commercial", "Country Properties". You may invent a parent if a group clearly fits a different category.

Reply ONLY with valid JSON (no markdown, no commentary):
{ "<ParentName>": ["<ChildName1>", "<ChildName2>", ...], ... }

Do NOT include a parent if it has fewer than 2 children. Do NOT include any child in more than one parent.`;

    return this.callOpenRouterJson(tenantId, prompt);
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
