import type { BuyerWishlist } from '@spm/shared';
import { MATCH_LISTING_TYPES } from './buyer-match';

// Website intake, the pure part: the wishlist guessed from the properties a
// visitor asked about, and who gets the next website buyer on round-robin.

export interface PlaceRow {
  id: number;
  parentId: number | null;
  level: string;
}

// The listing fields a guess reads. Decimal columns come back as strings.
export interface GuessProperty {
  listingType: string;
  propertyTypeId: number | null;
  locationId: number | null;
  price: number | string | null;
  priceTo?: number | string | null;
  priceOnRequest: boolean | number;
  bedrooms: number | string | null;
  currency?: string | null;
}

// A listing's place walked up to town level: an urbanization becomes its
// town. A town, or a place above town level (area, province), stays itself,
// and so does a place with no town above it.
export function townOf(locationId: number, byId: Map<number, PlaceRow>): number {
  const seen = new Set<number>();
  let cur = byId.get(locationId);
  while (cur && !seen.has(cur.id)) {
    if (cur.level === 'town') return cur.id;
    if (cur.level !== 'urbanization') return locationId;
    seen.add(cur.id);
    cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
  }
  return locationId;
}

function positive(v: unknown): number | undefined {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
}

function unique<T>(items: (T | null | undefined)[]): T[] {
  return [...new Set(items.filter((x): x is T => x !== null && x !== undefined))];
}

// Same listing types and property types, the towns, price −20% … +20% and at
// least the fewest bedrooms. Null when there is nothing to go on.
export function guessWishlist(props: GuessProperty[], town: (locationId: number | null) => number | null): BuyerWishlist | null {
  const out: BuyerWishlist = {};
  const types = unique(props.map((p) => p.listingType)).filter((t): t is NonNullable<BuyerWishlist['listingTypes']>[number] =>
    (MATCH_LISTING_TYPES as readonly string[]).includes(t),
  );
  if (types.length) out.listingTypes = types;
  const propertyTypeIds = unique(props.map((p) => p.propertyTypeId));
  if (propertyTypeIds.length) out.propertyTypeIds = propertyTypeIds;
  const locationIds = unique(props.map((p) => town(p.locationId)));
  if (locationIds.length) out.locationIds = locationIds;

  const priced = props.filter((p) => !p.priceOnRequest && positive(p.price));
  if (priced.length) {
    out.budgetMin = Math.round(Math.min(...priced.map((p) => positive(p.price)!)) * 0.8);
    out.budgetMax = Math.round(Math.max(...priced.map((p) => positive(p.priceTo) ?? positive(p.price)!)) * 1.2);
  }
  const beds = props.map((p) => positive(p.bedrooms)).filter((n): n is number => n !== undefined);
  if (beds.length) out.minBedrooms = Math.min(...beds);
  if (!Object.keys(out).length) return null;
  const currency = props.find((p) => p.currency)?.currency;
  if (currency) out.currency = currency;
  out.guessed = true;
  return out;
}

// A second enquiry on a buyer whose wishlist is still a guess: both kinds of
// property stay wanted (union), the budget covers both, bedrooms the lower.
export function mergeGuess(previous: BuyerWishlist | null, next: BuyerWishlist): BuyerWishlist {
  if (!previous) return next;
  const out: BuyerWishlist = { guessed: true };
  const list = <K extends 'listingTypes' | 'propertyTypeIds' | 'locationIds'>(key: K) => {
    const merged = unique([...(previous[key] ?? []), ...(next[key] ?? [])] as unknown[]);
    if (merged.length) (out as Record<string, unknown>)[key] = merged;
  };
  list('listingTypes');
  list('propertyTypeIds');
  list('locationIds');
  const lo = [previous.budgetMin, next.budgetMin].filter((n): n is number => n != null);
  const hi = [previous.budgetMax, next.budgetMax].filter((n): n is number => n != null);
  if (lo.length) out.budgetMin = Math.min(...lo);
  if (hi.length) out.budgetMax = Math.max(...hi);
  const beds = [previous.minBedrooms, next.minBedrooms].filter((n): n is number => n != null);
  if (beds.length) out.minBedrooms = Math.min(...beds);
  const currency = previous.currency || next.currency;
  if (currency) out.currency = currency;
  // Key order as a fresh guess has it.
  return Object.fromEntries(
    ['listingTypes', 'propertyTypeIds', 'locationIds', 'budgetMin', 'budgetMax', 'minBedrooms', 'currency', 'guessed']
      .filter((k) => k in out)
      .map((k) => [k, (out as Record<string, unknown>)[k]]),
  ) as BuyerWishlist;
}

// Round-robin without a counter: the rotation agent who has gone longest
// without an automatic buyer (never = first), ties in rotation order. The
// state is the assignment log itself, so every API process agrees.
// lastAuto = agent → the id of their latest automatic assignment entry (ids
// only grow; timestamps tie within a second).
export function pickRotationAgent(rotation: number[], lastAuto: Map<number, number>): number | null {
  let best: number | null = null;
  let bestAt = Infinity;
  for (const id of rotation) {
    const at = lastAuto.get(id) ?? -Infinity;
    if (at < bestAt) {
      best = id;
      bestAt = at;
    }
  }
  return best;
}
