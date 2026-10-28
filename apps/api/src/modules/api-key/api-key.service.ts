import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ApiKeyScope, ApiKeySummary } from '@spm/shared';
import { ApiKey, Property, Tenant } from '../../database/entities';
import { generateApiKey } from '../../common/crypto/api-key';
import { cleanAllowedDomains, cleanKeyScope, cleanKeySettings } from '../property/key-scope';
import { PropertySearchService } from '../property/property-search.service';
import { LocationService } from '../location/location.service';
import { PropertyTypeService } from '../property-type/property-type.service';
import { FeatureService } from '../feature/feature.service';
import { AiService, ENRICHMENT_MODEL } from '../ai/ai.service';

// A client's website keys (Settings -> API Keys). The main key on the tenant
// row shows everything and keeps working exactly as before; the keys here are
// extra websites, each limited by its scope.

const MAX_KEYS_PER_CLIENT = 20;

type Named = { id: number; name: unknown; parentId?: number | null; level?: string; category?: string };

const label = (name: unknown): string =>
  typeof name === 'string' ? name : (name as Record<string, string> | null)?.en ?? Object.values((name as object) || {})[0] ?? '';

export interface KeyStats {
  count: number;
  views30d: number;
  enquiries30d: number;
}

export interface MainKeySummary extends KeyStats {
  last4: string;
}

interface KeyInput {
  scope?: unknown;
  allowedDomains?: unknown;
  settings?: unknown;
}

export interface KeySuggestion {
  name: string;
  why: string;
  scope: ApiKeyScope;
  count: number;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly keys: Repository<ApiKey>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    @InjectRepository(Property)
    private readonly properties: Repository<Property>,
    private readonly search: PropertySearchService,
    private readonly locations: LocationService,
    private readonly propertyTypes: PropertyTypeService,
    private readonly features: FeatureService,
    private readonly ai: AiService,
  ) {}

  async list(tenantId: number): Promise<{ main: MainKeySummary; keys: Array<ApiKeySummary & KeyStats>; total: number }> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'apiKeyLast4'] });
    if (!tenant) throw new NotFoundException('Client not found');
    const rows = await this.keys.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
    const { total } = await this.search.countForKeyScope(tenantId, null);
    const stats = await this.stats(tenantId);
    const statsFor = (id: number | null): Omit<KeyStats, 'count'> => stats.get(id ?? 0) ?? { views30d: 0, enquiries30d: 0 };
    const keys = await Promise.all(
      rows.map(async (row) => ({
        ...this.toSummary(row),
        count: (await this.search.countForKeyScope(tenantId, cleanKeyScope(row.scope))).count,
        ...statsFor(row.id),
      })),
    );
    return { main: { last4: tenant.apiKeyLast4, count: total, ...statsFor(null) }, keys, total };
  }

  // Property views and website enquiries per key over the last 30 days
  // (key 0 = the main key), for "which website brings the leads".
  private async stats(tenantId: number): Promise<Map<number, { views30d: number; enquiries30d: number }>> {
    const db = this.keys.manager;
    const [views, leads]: Array<Array<{ k: number | null; n: string }>> = await Promise.all([
      db.query(
        'SELECT apiKeyId AS k, COUNT(*) AS n FROM property_views WHERE tenantId = ? AND viewedAt >= NOW() - INTERVAL 30 DAY GROUP BY apiKeyId',
        [tenantId],
      ),
      db.query(
        "SELECT apiKeyId AS k, COUNT(*) AS n FROM leads WHERE tenantId = ? AND source = 'widget_inquiry' AND createdAt >= NOW() - INTERVAL 30 DAY GROUP BY apiKeyId",
        [tenantId],
      ),
    ]);
    const out = new Map<number, { views30d: number; enquiries30d: number }>();
    const at = (k: number | null) => {
      const id = Number(k) || 0;
      if (!out.has(id)) out.set(id, { views30d: 0, enquiries30d: 0 });
      return out.get(id)!;
    };
    for (const r of views) at(r.k).views30d = Number(r.n);
    for (const r of leads) at(r.k).enquiries30d = Number(r.n);
    return out;
  }

  // The raw key is in this reply only; the dashboard shows it once.
  async create(tenantId: number, input: KeyInput & { name: string }): Promise<{ key: ApiKeySummary; apiKey: string }> {
    if ((await this.keys.count({ where: { tenantId } })) >= MAX_KEYS_PER_CLIENT) {
      throw new BadRequestException(`A client can have up to ${MAX_KEYS_PER_CLIENT} website keys.`);
    }
    const generated = generateApiKey();
    const row = await this.keys.save(
      this.keys.create({
        tenantId,
        name: input.name.trim(),
        keyHash: generated.hash,
        last4: generated.last4,
        scope: cleanKeyScope(input.scope),
        allowedDomains: cleanAllowedDomains(input.allowedDomains),
        settings: cleanKeySettings(input.settings),
        isActive: true,
      }),
    );
    return { key: this.toSummary(row), apiKey: generated.rawKey };
  }

  async update(tenantId: number, id: number, patch: KeyInput & { name?: string; isActive?: boolean }): Promise<ApiKeySummary> {
    const row = await this.find(tenantId, id);
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.scope !== undefined) row.scope = cleanKeyScope(patch.scope);
    if (patch.allowedDomains !== undefined) row.allowedDomains = cleanAllowedDomains(patch.allowedDomains);
    if (patch.settings !== undefined) row.settings = cleanKeySettings(patch.settings);
    if (patch.isActive !== undefined) row.isActive = patch.isActive;
    return this.toSummary(await this.keys.save(row));
  }

  // A new key for this website only; the client's other sites are untouched.
  async rotate(tenantId: number, id: number): Promise<{ key: ApiKeySummary; apiKey: string }> {
    const row = await this.find(tenantId, id);
    const generated = generateApiKey();
    row.keyHash = generated.hash;
    row.last4 = generated.last4;
    row.lastUsedAt = null;
    row.lastUsedOrigin = null;
    return { key: this.toSummary(await this.keys.save(row)), apiKey: generated.rawKey };
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const row = await this.find(tenantId, id);
    await this.keys.remove(row);
  }

  // The live count (and a few listings) while a scope is being edited.
  async preview(tenantId: number, rawScope: unknown): Promise<{
    count: number;
    total: number;
    scope: ApiKeyScope | null;
    sample: Array<{ reference: string; title: string; price: number | null; currency: string; image: string | null }>;
  }> {
    const scope = cleanKeyScope(rawScope);
    const { count, total } = await this.search.countForKeyScope(tenantId, scope);
    const query = this.properties
      .createQueryBuilder('p')
      .select(['p.id', 'p.reference', 'p.title', 'p.price', 'p.currency', 'p.images'])
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true });
    await this.search.applyKeyScope(query, scope, tenantId);
    const rows = await query.orderBy('p.updatedAt', 'DESC').take(4).getMany();
    const sample = rows.map((p) => {
      const images = Array.isArray(p.images) ? [...p.images].sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0)) : [];
      const first: any = images[0];
      return {
        reference: p.reference,
        title: label(p.title),
        price: p.price != null ? Number(p.price) : null,
        currency: p.currency,
        image: first ? first.thumbnailUrl || first.url || null : null,
      };
    });
    return { count, total, scope, sample };
  }

  /**
   * "Marbella and Benahavís new builds over 500k with a pool" -> a scope the
   * dashboard ticks in its pickers for the client to check before saving.
   * Setup work, so it runs on the client's AI key when they have one, else on
   * the platform key (same rule as locations and types).
   */
  async aiScope(tenantId: number, text: string): Promise<{ scope: ApiKeyScope | null; summary: string; name: string }> {
    const [locations, types, features] = await Promise.all([
      this.locations.findAll(tenantId),
      this.propertyTypes.findAll(tenantId),
      this.features.findAll(tenantId),
    ]);
    const list = (rows: Named[]) =>
      rows.map((r) => `${r.id}: ${label(r.name)}${r.level ? ` (${r.level})` : ''}${r.category ? ` (${r.category})` : ''}`).join('\n');
    const system = [
      'You turn a description of a property website into the filters for its key. Answer with JSON only, no prose and no code fences.',
      '',
      'LOCATIONS (id: name)', list(locations),
      '',
      'PROPERTY TYPES (id: name)', list(types),
      '',
      'FEATURES (id: name)', list(features),
      '',
      'RULES',
      '- Use only ids from the lists above. Several places or types are allowed. If nothing matches, leave the field out.',
      '- Pick the broadest matching place: "Marbella" is the Marbella entry, not each area inside it.',
      '- listingTypes holds any of: sale, rent, holiday_rent, development ("new build" / "new development" is development, "resale" is sale).',
      '- "500k" is 500000, "1.5m" is 1500000. "over X" sets priceMin, "under X" sets priceMax.',
      '- Features: featureMatch is "all" unless the text says "or" / "any of".',
      '- ownOnly when the text says only the agency\'s own listings; featuredOnly when it says only featured ones.',
      '- name: a short name for the website key, e.g. "Marbella New Builds".',
      '- summary: one short sentence saying what the key will show.',
      '',
      'Reply with this shape, leaving out anything the text does not say:',
      '{"scope":{"locationIds":[],"propertyTypeIds":[],"listingTypes":[],"features":[],"featureMatch":"all","priceMin":0,"priceMax":0,"ownOnly":false,"featuredOnly":false},"name":"","summary":""}',
    ].join('\n');

    const parsed = (await this.askJson(tenantId, system, `Website: "${text.trim()}"`, 800)) as { scope?: unknown; summary?: unknown; name?: unknown };
    return {
      scope: this.knownIdsOnly(parsed.scope, locations, types, features),
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 300) : '',
      name: typeof parsed.name === 'string' ? parsed.name.trim().slice(0, 100) : '',
    };
  }

  /**
   * Up to four website keys worth having, from how the client's stock splits
   * (areas, new builds vs resale, rentals): each with a name, a reason and the
   * number of listings it would show. Same AI key rule as aiScope.
   */
  async suggest(tenantId: number): Promise<KeySuggestion[]> {
    const [locations, types, features] = await Promise.all([
      this.locations.findAll(tenantId),
      this.propertyTypes.findAll(tenantId),
      this.features.findAll(tenantId),
    ]);
    const db = this.keys.manager;
    const live = "tenantId = ? AND status = 'active' AND isPublished = 1";
    const [byLocation, byListingType, byType]: Array<Array<{ id: unknown; n: string }>> = await Promise.all([
      db.query(`SELECT locationId AS id, COUNT(*) AS n FROM properties WHERE ${live} AND locationId IS NOT NULL GROUP BY locationId`, [tenantId]),
      db.query(`SELECT listingType AS id, COUNT(*) AS n FROM properties WHERE ${live} GROUP BY listingType`, [tenantId]),
      db.query(`SELECT propertyTypeId AS id, COUNT(*) AS n FROM properties WHERE ${live} AND propertyTypeId IS NOT NULL GROUP BY propertyTypeId`, [tenantId]),
    ]);
    // Each place's count includes everything below it; the 60 biggest are enough to plan from.
    const parentOf = new Map(locations.map((l) => [l.id, l.parentId ?? null]));
    const rolled = new Map<number, number>();
    for (const r of byLocation) {
      const seen = new Set<number>();
      for (let at: number | null | undefined = Number(r.id); at != null && !seen.has(at); at = parentOf.get(at)) {
        seen.add(at);
        rolled.set(at, (rolled.get(at) || 0) + Number(r.n));
      }
    }
    const placeLines = locations
      .filter((l) => rolled.get(l.id))
      .sort((a, b) => (rolled.get(b.id) || 0) - (rolled.get(a.id) || 0))
      .slice(0, 60)
      .map((l) => `${l.id}: ${label(l.name)}${l.level ? ` (${l.level})` : ''}${l.parentId ? ` in ${l.parentId}` : ''} — ${rolled.get(l.id)} listings`);
    const typeName = new Map(types.map((t) => [t.id, label(t.name)]));
    const system = [
      'You advise a real-estate agency which extra websites (each with its own filtered property feed) would make sense for their stock. Answer with JSON only, no prose and no code fences.',
      '',
      'PLACES (id: name (level) in parentId — listings)', ...placeLines,
      '',
      'LISTING TYPES (listings)', ...byListingType.map((r) => `${r.id}: ${r.n}`),
      '',
      'PROPERTY TYPES (id: name — listings)', ...byType.map((r) => `${r.id}: ${typeName.get(Number(r.id)) || '?'} — ${r.n}`),
      '',
      'RULES',
      '- Suggest 2 to 4 websites that split the stock in useful ways buyers search: an area, new developments, rentals, luxury.',
      '- Each must show at least 20 listings and fewer than all of them. Use only ids from the lists.',
      '- listingTypes values: sale, rent, holiday_rent, development. Prices in euros.',
      '- name: short, e.g. "Marbella New Builds". why: one short sentence with the number of listings.',
      '',
      'Reply with: {"suggestions":[{"name":"","why":"","scope":{"locationIds":[],"propertyTypeIds":[],"listingTypes":[],"priceMin":0,"priceMax":0}}]}',
    ].join('\n');
    const parsed = (await this.askJson(tenantId, system, 'Suggest the websites.', 1200)) as { suggestions?: unknown };
    const raw = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 4) : [];
    const out: KeySuggestion[] = [];
    for (const s of raw as Array<{ name?: unknown; why?: unknown; scope?: unknown }>) {
      const scope = this.knownIdsOnly(s.scope, locations, types, features);
      if (!scope || typeof s.name !== 'string' || !s.name.trim()) continue;
      const { count, total } = await this.search.countForKeyScope(tenantId, scope);
      if (!count || count >= total) continue;
      out.push({ name: s.name.trim().slice(0, 100), why: typeof s.why === 'string' ? s.why.slice(0, 300) : '', scope, count });
    }
    return out;
  }

  // One JSON answer from the model on the client's key, else the platform key.
  private async askJson(tenantId: number, system: string, user: string, maxTokens: number): Promise<Record<string, unknown>> {
    const resolved = await this.ai.resolveClientFirstKey(tenantId, ENRICHMENT_MODEL);
    if (!resolved) throw new ServiceUnavailableException('No AI key is set up. Pick the filters by hand instead.');
    let reply: string;
    try {
      reply = await this.ai.chatCompletion(
        tenantId,
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { model: ENRICHMENT_MODEL, temperature: 0, maxTokens, json: true, keySource: 'client-first' },
      );
    } catch (err) {
      this.logger.warn(`AI website key call failed for tenant ${tenantId}: ${(err as Error).message}`);
      throw new ServiceUnavailableException('The AI could not answer right now. Pick the filters by hand instead.');
    }
    try {
      const parsed = JSON.parse(String(reply).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim());
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw new ServiceUnavailableException('The AI answer could not be read. Try saying it another way.');
    }
  }

  // A scope from the model, with only ids that are really the client's.
  private knownIdsOnly(raw: unknown, locations: Named[], types: Named[], features: Named[]): ApiKeyScope | null {
    const scope = cleanKeyScope(raw);
    if (!scope) return null;
    const keep = (ids: number[] | undefined, rows: Named[]) => {
      const known = new Set(rows.map((r) => r.id));
      const out = (ids || []).filter((id) => known.has(id));
      return out.length ? out : undefined;
    };
    scope.locationIds = keep(scope.locationIds, locations);
    scope.propertyTypeIds = keep(scope.propertyTypeIds, types);
    scope.features = keep(scope.features, features);
    if (!scope.features) delete scope.featureMatch;
    return cleanKeyScope(scope);
  }

  private async find(tenantId: number, id: number): Promise<ApiKey> {
    const row = await this.keys.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Website key not found');
    return row;
  }

  private toSummary(row: ApiKey): ApiKeySummary {
    return {
      id: row.id,
      name: row.name,
      last4: row.last4,
      scope: cleanKeyScope(row.scope) ?? {},
      allowedDomains: cleanAllowedDomains(row.allowedDomains) ?? [],
      settings: cleanKeySettings(row.settings) ?? {},
      isActive: row.isActive,
      lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
      lastUsedOrigin: row.lastUsedOrigin,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}
