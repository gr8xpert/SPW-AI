import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiSearchUsage, Tenant } from '../../database/entities';
import { AiService, ChatMessage, MultimodalMessage } from './ai.service';
import { readWav } from './wav';
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
  // Voice only: the words the model heard, put in the search box so the
  // visitor can see (and correct) them.
  heard?: string;
}

const LISTING_TYPES = new Set(['sale', 'rent', 'holiday_rent', 'development']);
// The old widget hardcoded this; here it is only the fallback, and the client's
// own choice in Settings → AI wins.
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_DAILY_LIMIT = 200;
// Long enough for a sentence about a house, short enough that a pasted wall of
// text can't run up the client's bill.
export const MAX_QUERY_LENGTH = 400;

// Voice search needs a model that accepts audio, whatever the client picked
// for text (Claude, for one, can't hear). First one OpenRouter still offers
// wins; cheap and fast, since a spoken search is a sentence, not a podcast.
export const VOICE_MODELS = [
  'google/gemini-3.1-flash-lite',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
];
// The widget stops recording at 15 s; a little slack for the header and
// rounding. 16 kHz mono 16-bit is 32 KB/s, so 20 s fits well inside 1 MB.
export const MAX_VOICE_SECONDS = 20;
export const MIN_VOICE_SECONDS = 0.4;
export const MAX_VOICE_BYTES = 1_000_000;

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

  /** Whether super admin has switched voice on for this site (off by default). */
  voiceEnabled(tenant: Tenant): boolean {
    return tenant.featureFlags?.aiVoiceSearch === true;
  }

  /** Whether a site can offer AI search at all: switched on, and paid for. */
  async status(tenant: Tenant): Promise<{ enabled: boolean; reason?: string }> {
    if (!tenant.aiSearchEnabled) return { enabled: false, reason: 'disabled' };
    // Only the key the client sees in Settings → AI counts. A leftover legacy
    // copy in settings JSON is hidden from the dashboard, so honouring it
    // showed AI search on sites whose AI tab says "no key". The platform key
    // is never spent on a client's visitors.
    if (!(await this.ai.hasClientKey(tenant.id))) return { enabled: false, reason: 'no_api_key' };
    return { enabled: true };
  }

  async search(tenant: Tenant, query: string, language = 'en'): Promise<AiSearchResult> {
    const trimmed = (query || '').trim();
    if (!trimmed) throw new BadRequestException('Describe what you are looking for.');
    if (trimmed.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException(`Keep it under ${MAX_QUERY_LENGTH} characters.`);
    }

    return this.ask(tenant, language, {
      model: (await this.model(tenant.id)) || DEFAULT_MODEL,
      message: { role: 'user', content: `Parse this property search: "${trimmed}"` },
    });
  }

  /**
   * The visitor spoke instead of typing. The recording goes straight to an
   * audio-capable model together with the client's own lists, so it hears
   * "Benahavís" as the location it is rather than guessing at a spelling —
   * one call, on the client's key, under the same daily ceiling.
   */
  async voiceSearch(tenant: Tenant, audio: Buffer | undefined, language = 'en'): Promise<AiSearchResult> {
    // Its own switch in Super Admin, on top of AI search being on.
    if (!this.voiceEnabled(tenant)) throw new ForbiddenException('Voice search is not enabled for this website.');
    if (!audio?.length) throw new BadRequestException('No recording arrived. Please try again.');
    if (audio.length > MAX_VOICE_BYTES) throw new BadRequestException('That recording is too long.');
    const wav = readWav(audio);
    if (!wav) throw new BadRequestException('That recording could not be read. Please try again.');
    if (wav.seconds < MIN_VOICE_SECONDS) throw new BadRequestException('That was too short. Hold on a moment longer.');
    if (wav.seconds > MAX_VOICE_SECONDS) throw new BadRequestException('Keep it under 15 seconds.');

    const model = await this.ai.firstAvailableModel(VOICE_MODELS);
    if (!model) {
      this.logger.error('No audio-capable model is available on OpenRouter for voice search');
      throw new ServiceUnavailableException('Voice search is unavailable right now. Please type instead.');
    }

    return this.ask(tenant, language, {
      model,
      voice: true,
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'Parse the property search spoken in this recording.' },
          { type: 'input_audio', input_audio: { data: audio.toString('base64'), format: 'wav' } },
        ],
      },
    });
  }

  // Shared by typing and speaking: the gates, the daily ceiling, the client's
  // lists, one model call on the client's key, and the strict parse.
  private async ask(
    tenant: Tenant,
    language: string,
    req: { model: string; message: ChatMessage | MultimodalMessage; voice?: boolean },
  ): Promise<AiSearchResult> {
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

    let reply: string;
    try {
      reply = await this.ai.chatCompletion(
        tenant.id,
        [
          { role: 'system', content: this.systemPrompt(locations, types, features, language, req.voice) },
          req.message,
        ],
        {
          model: req.model,
          temperature: 0.1,
          maxTokens: 500,
          // Spends the client's own credit, never the platform key.
          keySource: 'client',
        },
      );
    } catch (err) {
      // "Your key is invalid / out of credit" is for the client, not their
      // visitors: log the reason, show the visitor something they can act on.
      this.logger.warn(`AI search failed for tenant ${tenant.id} (${req.model}): ${(err as Error).message}`);
      throw new ServiceUnavailableException('AI search is unavailable right now. Please use the filters instead.');
    }

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
    voice = false,
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
      ...(voice
        ? [
          `- The visitor SPOKE the search; the website is in "${language}" but they may speak any language.`,
          '- Place names you hear are most likely ones in the LOCATIONS list, even when pronounced loosely.',
          '- If the recording is silent, noise, or not about a property, return empty filters.',
          '- Also return "heard": what they said, written out in the language they spoke.',
        ]
        : [`- The visitor is writing in "${language}".`]),
      '',
      'Reply with this shape, leaving out anything the sentence does not say:',
      `{"filters":{"locationId":0,"propertyTypeId":0,"listingType":"","minBedrooms":0,"minBathrooms":0,"minPrice":0,"maxPrice":0,"minBuildSize":0,"maxBuildSize":0,"minPlotSize":0,"maxPlotSize":0,"features":[],"reference":""},"interpretation":"one short sentence"${voice ? ',"heard":"what they said"' : ''}}`,
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

    let parsed: { filters?: Record<string, unknown>; interpretation?: unknown; heard?: unknown };
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

    const heard = typeof parsed.heard === 'string' && parsed.heard.trim()
      ? parsed.heard.trim().slice(0, MAX_QUERY_LENGTH)
      : undefined;

    return { filters: out, interpretation, ...(heard ? { heard } : {}) };
  }
}
