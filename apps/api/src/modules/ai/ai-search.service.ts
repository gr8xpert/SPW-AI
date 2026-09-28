import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiSearchUsage, Tenant } from '../../database/entities';
import { AiService } from './ai.service';
import { LocationService } from '../location/location.service';
import { PropertyTypeService } from '../property-type/property-type.service';
import { FeatureService } from '../feature/feature.service';

// What the model is allowed to return. Anything else it invents is dropped.
export interface AiSearchFilters {
  locationId?: number;
  propertyTypeId?: number;
  listingType?: string;
  minBedrooms?: number;
  minBathrooms?: number;
  minPrice?: number;
  maxPrice?: number;
  minBuildSize?: number;
  maxBuildSize?: number;
  minPlotSize?: number;
  maxPlotSize?: number;
  features?: number[];
  reference?: string;
}

export interface AiSearchResult {
  filters: AiSearchFilters;
  // A plain sentence describing what was understood, shown back to the visitor.
  interpretation?: string;
}

const LISTING_TYPES = new Set(['sale', 'rent', 'holiday_rent', 'development']);
// The old widget hardcoded this; here it is only the fallback, and the client's
// own choice in Settings → AI wins.
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_DAILY_LIMIT = 200;
// Long enough for a sentence about a house, short enough that a pasted wall of
// text can't run up the client's bill.
export const MAX_QUERY_LENGTH = 400;

@Injectable()
export class AiSearchService {
  private readonly logger = new Logger(AiSearchService.name);

  constructor(
    private readonly ai: AiService,
    private readonly locations: LocationService,
    private readonly propertyTypes: PropertyTypeService,
    private readonly features: FeatureService,
    @InjectRepository(AiSearchUsage) private readonly usage: Repository<AiSearchUsage>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  /** Whether a site can offer AI search at all: switched on, and paid for. */
  async status(tenant: Tenant): Promise<{ enabled: boolean; reason?: string }> {
    if (!tenant.aiSearchEnabled) return { enabled: false, reason: 'disabled' };
    const row = await this.tenants.findOne({
      where: { id: tenant.id },
      select: ['id', 'settings', 'openrouterApiKey'],
    });
    const hasKey = !!(row?.openrouterApiKey || row?.settings?.openRouterApiKey);
    // No key means no credit to spend: the platform key is for super-admin
    // work, never for a client's visitors.
    if (!hasKey) return { enabled: false, reason: 'no_api_key' };
    return { enabled: true };
  }

  async search(tenant: Tenant, query: string, language = 'en'): Promise<AiSearchResult> {
    const trimmed = (query || '').trim();
    if (!trimmed) throw new BadRequestException('Describe what you are looking for.');
    if (trimmed.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(`Keep it under ${MAX_QUERY_LENGTH} characters.`);
    }

    const state = await this.status(tenant);
    if (!state.enabled) {
      throw new ForbiddenException(
        state.reason === 'no_api_key'
          ? 'AI search needs an OpenRouter API key. Add yours in Settings → AI.'
          : 'AI search is not enabled for this website.',
      );
    }

    await this.consumeDailyAllowance(tenant);

    const [locations, types, features] = await Promise.all([
      this.locations.findAll(tenant.id),
      this.propertyTypes.findAll(tenant.id),
      this.features.findAll(tenant.id),
    ]);

    const reply = await this.ai.chatCompletion(
      tenant.id,
      [
        { role: 'system', content: this.systemPrompt(locations, types, features, language) },
        { role: 'user', content: `Parse this property search: "${trimmed}"` },
      ],
      {
        model: (await this.model(tenant.id)) || DEFAULT_MODEL,
        temperature: 0.1,
        maxTokens: 500,
        // Never the platform key: this spends the client's own credit.
        allowPlatformKey: false,
      },
    );

    return this.parse(reply, locations, types, features);
  }

  private async model(tenantId: number): Promise<string | null> {
    const row = await this.tenants.findOne({ where: { id: tenantId }, select: ['id', 'settings'] });
    return row?.settings?.openRouterModel || null;
  }

  /**
   * Counts today's search and refuses once the client's ceiling is reached.
   * Checked before the model is called, so a run-away script costs nothing
   * beyond a row update.
   */
  private async consumeDailyAllowance(tenant: Tenant): Promise<void> {
    const row = await this.tenants.findOne({ where: { id: tenant.id }, select: ['id', 'settings'] });
    const limit = Number(row?.settings?.aiSearchDailyLimit ?? DEFAULT_DAILY_LIMIT);
    const day = new Date().toISOString().slice(0, 10);

    const existing = await this.usage.findOne({ where: { tenantId: tenant.id, day } });
    if (existing && existing.count >= limit) {
      this.logger.warn(`AI search daily limit reached for tenant ${tenant.id} (${limit})`);
      throw new ForbiddenException('Today’s AI searches are used up. The normal filters still work.');
    }

    // Atomic, so two visitors at once can't both slip past the ceiling.
    await this.usage.query(
      `INSERT INTO ai_search_usage (tenantId, day, count) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE count = count + 1`,
      [tenant.id, day],
    );
  }

  private systemPrompt(
    locations: Array<{ id: number; name: unknown; level?: string }>,
    types: Array<{ id: number; name: unknown }>,
    features: Array<{ id: number; name: unknown; category?: string }>,
    language: string,
  ): string {
    const label = (name: unknown): string =>
      typeof name === 'string' ? name : (name as Record<string, string>)?.en ?? Object.values(name as object)[0] ?? '';

    const list = (rows: Array<{ id: number; name: unknown; level?: string; category?: string }>) =>
      rows.map((r) => `${r.id}: ${label(r.name)}${r.level ? ` (${r.level})` : ''}${r.category ? ` (${r.category})` : ''}`).join('\n');

    return [
      'You turn a sentence about a property into search filters. Answer with JSON only, no prose and no code fences.',
      '',
      'LOCATIONS (id: name)', list(locations),
      '',
      'PROPERTY TYPES (id: name)', list(types),
      '',
      'FEATURES (id: name)', list(features),
      '',
      'RULES',
      '- Use only ids from the lists above. If nothing matches, leave the field out.',
      '- "500k" is 500000, "1.5m" is 1500000.',
      '- "under X" sets maxPrice, "over X" sets minPrice, "X to Y" sets both.',
      '- "3 bed", "3br" sets minBedrooms. Bathrooms set minBathrooms.',
      '- listingType is one of: sale, rent, holiday_rent, development ("new build" is development).',
      '- Sizes in m² set minBuildSize/maxBuildSize, plots set minPlotSize/maxPlotSize.',
      '- A reference code like "R1234567" sets reference.',
      `- The visitor is writing in "${language}".`,
      '',
      'Reply with this shape, leaving out anything the sentence does not say:',
      '{"filters":{"locationId":0,"propertyTypeId":0,"listingType":"","minBedrooms":0,"minBathrooms":0,"minPrice":0,"maxPrice":0,"minBuildSize":0,"maxBuildSize":0,"minPlotSize":0,"maxPlotSize":0,"features":[],"reference":""},"interpretation":"one short sentence"}',
    ].join('\n');
  }

  /**
   * The model's reply is untrusted: it may fence the JSON, invent ids, or send
   * a price as a string. Everything is checked against the client's own lists
   * before it becomes a search.
   */
  private parse(
    reply: string,
    locations: Array<{ id: number }>,
    types: Array<{ id: number }>,
    features: Array<{ id: number }>,
  ): AiSearchResult {
    const cleaned = reply.replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new BadRequestException('Could not understand that search. Try different words.');
    }

    let parsed: { filters?: Record<string, unknown>; interpretation?: unknown };
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new BadRequestException('Could not understand that search. Try different words.');
    }

    const raw = (parsed.filters ?? {}) as Record<string, unknown>;
    const out: AiSearchFilters = {};

    const num = (value: unknown): number | undefined => {
      const n = typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : Number(value);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
    };
    const oneOf = (value: unknown, ids: Set<number>): number | undefined => {
      const n = num(value);
      return n !== undefined && ids.has(n) ? n : undefined;
    };

    const locationIds = new Set(locations.map((l) => l.id));
    const typeIds = new Set(types.map((t) => t.id));
    const featureIds = new Set(features.map((f) => f.id));

    out.locationId = oneOf(raw.locationId ?? raw.location, locationIds);
    out.propertyTypeId = oneOf(raw.propertyTypeId ?? raw.propertyType, typeIds);

    const listingType = String(raw.listingType ?? raw.listing ?? '').trim();
    if (LISTING_TYPES.has(listingType)) out.listingType = listingType;

    for (const [key, source] of [
      ['minBedrooms', raw.minBedrooms ?? raw.bedsMin],
      ['minBathrooms', raw.minBathrooms ?? raw.bathsMin],
      ['minPrice', raw.minPrice ?? raw.priceMin],
      ['maxPrice', raw.maxPrice ?? raw.priceMax],
      ['minBuildSize', raw.minBuildSize ?? raw.builtMin],
      ['maxBuildSize', raw.maxBuildSize ?? raw.builtMax],
      ['minPlotSize', raw.minPlotSize ?? raw.plotMin],
      ['maxPlotSize', raw.maxPlotSize ?? raw.plotMax],
    ] as Array<[keyof AiSearchFilters, unknown]>) {
      const value = num(source);
      if (value !== undefined) (out as Record<string, unknown>)[key] = value;
    }

    if (out.minPrice && out.maxPrice && out.minPrice > out.maxPrice) {
      [out.minPrice, out.maxPrice] = [out.maxPrice, out.minPrice];
    }

    const wanted = Array.isArray(raw.features) ? raw.features : [];
    const chosen = wanted.map((f) => oneOf(f, featureIds)).filter((f): f is number => f !== undefined);
    if (chosen.length) out.features = [...new Set(chosen)];

    const reference = String(raw.reference ?? raw.ref ?? '').trim();
    if (reference && /^[A-Za-z0-9_-]{2,40}$/.test(reference)) out.reference = reference;

    const interpretation = typeof parsed.interpretation === 'string'
      ? parsed.interpretation.slice(0, 200)
      : undefined;

    return { filters: out, interpretation };
  }
}
