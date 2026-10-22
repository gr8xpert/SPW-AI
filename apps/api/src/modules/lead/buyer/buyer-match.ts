import type { BuyerMatchWeights, BuyerWishlist } from '@spm/shared';

// Matching a buyer's wishlist against listings. Pure functions, so the
// service, Phase 2 alerts and reverse match all score the same way.
//
//   Must-haves (in SQL): listing type, area, property type, budget.
//   Wishes (scored here): bedrooms, bathrooms, build size, plot size, each
//   feature. score = 100 × weight of wishes met / weight of wishes asked.

export const MATCH_LISTING_TYPES = ['sale', 'rent', 'holiday_rent', 'development'] as const;
type MatchListingType = (typeof MATCH_LISTING_TYPES)[number];

// The listing fields scoring reads. Decimal columns come back as strings.
export interface ScoredFields {
  bedrooms: number | string | null;
  bedroomsTo?: number | string | null;
  bathrooms: number | string | null;
  bathroomsTo?: number | string | null;
  buildSize: number | string | null;
  buildSizeTo?: number | string | null;
  plotSize: number | string | null;
  plotSizeTo?: number | string | null;
  features: number[] | null;
}

export interface MatchScore {
  score: number;
  // bedrooms | bathrooms | buildSize | plotSize | feature:<id>
  met: string[];
  missed: string[];
}

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function idList(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const ids = [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return ids.length ? ids : undefined;
}

// A wishlist as stored (JSON, maybe written by the A1 migration or the
// website) made safe to match: numbers are numbers, ids are unique, empty
// lists and unknown values are gone.
export function cleanWishlist(raw: unknown): BuyerWishlist {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: BuyerWishlist = {};
  if (Array.isArray(r.listingTypes)) {
    const types = [...new Set(r.listingTypes.filter((t): t is MatchListingType => (MATCH_LISTING_TYPES as readonly unknown[]).includes(t)))];
    if (types.length) out.listingTypes = types;
  }
  const locationIds = idList(r.locationIds);
  if (locationIds) out.locationIds = locationIds;
  const propertyTypeIds = idList(r.propertyTypeIds);
  if (propertyTypeIds) out.propertyTypeIds = propertyTypeIds;
  const featureIds = idList(r.featureIds);
  if (featureIds) out.featureIds = featureIds;
  for (const key of ['minBedrooms', 'minBathrooms', 'budgetMin', 'budgetMax', 'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize'] as const) {
    const n = num(r[key]);
    if (n !== undefined && n > 0) out[key] = n;
  }
  if (typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency)) out.currency = r.currency;
  if (r.sendMatchesTo === 'buyer' || r.sendMatchesTo === 'agent' || r.sendMatchesTo === 'both') out.sendMatchesTo = r.sendMatchesTo;
  if (r.guessed !== undefined) out.guessed = !!r.guessed;
  return out;
}

// True when the wishlist asks for nothing that narrows the search.
export function isEmptyWishlist(w: BuyerWishlist): boolean {
  const { sendMatchesTo: _s, guessed: _g, currency: _c, ...rest } = w;
  return Object.keys(rest).length === 0;
}

// The listing types to search: the buyer's, limited to what the client's
// website shows. null = no limit. [] = nothing can match.
export function matchListingTypes(w: BuyerWishlist, siteTypes: string[] | null): string[] | null {
  const wanted = w.listingTypes?.length ? w.listingTypes : null;
  if (!wanted) return siteTypes;
  if (!siteTypes) return [...wanted];
  return wanted.filter((t) => siteTypes.includes(t));
}

// A range (development "1–3 beds", "80–120 m²") or a single value.
function range(from: unknown, to: unknown): { low: number; high: number } | null {
  const low = num(from);
  if (low === undefined) return null;
  const t = num(to);
  return { low, high: t !== undefined && t > low ? t : low };
}

export function scoreProperty(w: BuyerWishlist, p: ScoredFields, weights: BuyerMatchWeights): MatchScore {
  const met: string[] = [];
  const missed: string[] = [];
  let asked = 0;
  let got = 0;
  const wish = (key: string, weight: number, ok: boolean) => {
    asked += weight;
    if (ok) {
      got += weight;
      met.push(key);
    } else {
      missed.push(key);
    }
  };

  if (w.minBedrooms) {
    const r = range(p.bedrooms, p.bedroomsTo);
    wish('bedrooms', weights.bedrooms, !!r && r.high >= w.minBedrooms);
  }
  if (w.minBathrooms) {
    const r = range(p.bathrooms, p.bathroomsTo);
    wish('bathrooms', weights.bathrooms, !!r && r.high >= w.minBathrooms);
  }
  if (w.minBuildSize || w.maxBuildSize) {
    const r = range(p.buildSize, p.buildSizeTo);
    wish('buildSize', weights.buildSize, !!r && overlaps(r, w.minBuildSize, w.maxBuildSize));
  }
  if (w.minPlotSize || w.maxPlotSize) {
    const r = range(p.plotSize, p.plotSizeTo);
    wish('plotSize', weights.plotSize, !!r && overlaps(r, w.minPlotSize, w.maxPlotSize));
  }
  const has = new Set((Array.isArray(p.features) ? p.features : []).map(Number));
  for (const id of w.featureIds || []) {
    const override = weights.featureOverrides[String(id)];
    wish(`feature:${id}`, override !== undefined ? override : weights.feature, has.has(id));
  }

  const score = asked > 0 ? Math.round((100 * got) / asked) : 100;
  return { score, met, missed };
}

function overlaps(r: { low: number; high: number }, min?: number, max?: number): boolean {
  return (min === undefined || r.high >= min) && (max === undefined || r.low <= max);
}
