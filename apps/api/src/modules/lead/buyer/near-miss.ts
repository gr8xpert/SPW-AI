import type { BuyerWishlist } from '@spm/shared';

// Near misses: listings that miss exactly one must-have of a wishlist by a
// little — a bit over (or under) the budget, or in the next town over.
// Listing type and property type are never relaxed. Pure.

export interface Place {
  id: number;
  parentId: number | null;
  level: string;
  lat: number | null;
  lng: number | null;
  name: string;
}

export type NearMissReason =
  | { code: 'over_budget'; amount: number }
  | { code: 'under_budget'; amount: number }
  | { code: 'nearby'; place: string; km: number | null };

export type WishReason =
  | { code: 'bedrooms_short'; n: number | null }
  | { code: 'bathrooms_short'; n: number | null }
  | { code: 'build_size' }
  | { code: 'plot_size' }
  | { code: 'feature'; id: number };

export interface NearMissThresholds {
  // How far outside the budget still counts, in % of the budget (0 = off).
  budgetPercent: number;
  // How far a town may be from a wished town, in km (0 = off).
  nearbyKm: number;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// The town a place is in (itself when it is a town); null above town level.
export function townOf(id: number | null | undefined, byId: Map<number, Place>): Place | null {
  let p = id != null ? byId.get(id) : undefined;
  for (let i = 0; p && i < 8; i++) {
    if (p.level === 'town') return p;
    if (p.level !== 'urbanization') return null;
    p = p.parentId != null ? byId.get(p.parentId) : undefined;
  }
  return null;
}

export function distanceKm(a: Pick<Place, 'lat' | 'lng'>, b: Pick<Place, 'lat' | 'lng'>): number | null {
  const [la1, lo1, la2, lo2] = [num(a.lat), num(a.lng), num(b.lat), num(b.lng)];
  if (la1 === null || lo1 === null || la2 === null || lo2 === null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Towns near the wished places: within `km` of a wished town by
// coordinates, or a sibling town when either has none. Wished towns
// themselves are left out; a wished place above town level adds nothing
// (all its towns are wished already).
export function nearbyTowns(wishedIds: number[], byId: Map<number, Place>, km: number): Map<number, { place: string; km: number | null }> {
  const out = new Map<number, { place: string; km: number | null }>();
  if (!(km > 0)) return out;
  const wishedTowns = [...new Set(wishedIds.map((id) => townOf(id, byId)).filter((t): t is Place => !!t))];
  const wishedTownIds = new Set(wishedTowns.map((t) => t.id));
  const towns = [...byId.values()].filter((p) => p.level === 'town' && !wishedTownIds.has(p.id));
  for (const t of towns) {
    for (const w of wishedTowns) {
      const d = distanceKm(t, w);
      const near = d !== null ? d <= km : t.parentId != null && t.parentId === w.parentId;
      if (!near) continue;
      const prev = out.get(t.id);
      if (!prev || (d !== null && (prev.km === null || d < prev.km))) out.set(t.id, { place: t.name, km: d });
    }
  }
  return out;
}

export interface NearMissListing {
  price: number | string | null;
  priceTo: number | string | null;
  priceOnRequest?: boolean;
  locationId: number | null;
}

// The one must-have this listing misses by a little, or null (a full
// match, too far off, or more than one miss).
export function nearMissOf(
  w: Pick<BuyerWishlist, 'budgetMin' | 'budgetMax' | 'locationIds'>,
  p: NearMissListing,
  ctx: { inWished: (locationId: number | null) => boolean; nearby: Map<number, { place: string; km: number | null }>; byId: Map<number, Place> },
  t: NearMissThresholds,
): NearMissReason | null {
  const misses: (NearMissReason | 'far')[] = [];

  if (w.budgetMin || w.budgetMax) {
    const low = num(p.price) ?? 0;
    const high = Math.max(low, num(p.priceTo) ?? 0);
    if (p.priceOnRequest || !(low > 0)) return null; // unpriced: can't be judged
    const pct = Math.max(0, t.budgetPercent) / 100;
    if (w.budgetMax && low > w.budgetMax) {
      const over = Math.round(low - w.budgetMax);
      misses.push(pct > 0 && over <= w.budgetMax * pct ? { code: 'over_budget', amount: over } : 'far');
    } else if (w.budgetMin && high < w.budgetMin) {
      const under = Math.round(w.budgetMin - high);
      misses.push(pct > 0 && under <= w.budgetMin * pct ? { code: 'under_budget', amount: under } : 'far');
    }
  }

  if (w.locationIds?.length && !ctx.inWished(p.locationId)) {
    const town = townOf(p.locationId, ctx.byId);
    const near = town ? ctx.nearby.get(town.id) : undefined;
    misses.push(near ? { code: 'nearby', place: near.place, km: near.km === null ? null : Math.round(near.km * 10) / 10 } : 'far');
  }

  if (misses.length !== 1 || misses[0] === 'far') return null;
  return misses[0];
}

// The missed wishes of a listing (from scoreProperty's missed keys) in a
// form the dashboard can put into words.
export function wishReasons(
  missed: string[],
  w: Pick<BuyerWishlist, 'minBedrooms' | 'minBathrooms'>,
  p: { bedrooms?: unknown; bedroomsTo?: unknown; bathrooms?: unknown; bathroomsTo?: unknown },
): WishReason[] {
  const top = (a: unknown, b: unknown) => {
    const x = num(a);
    const y = num(b);
    if (x === null) return null;
    return y !== null && y > x ? y : x;
  };
  return missed.map((key): WishReason => {
    if (key === 'bedrooms') {
      const have = top(p.bedrooms, p.bedroomsTo);
      return { code: 'bedrooms_short', n: have !== null && w.minBedrooms ? w.minBedrooms - have : null };
    }
    if (key === 'bathrooms') {
      const have = top(p.bathrooms, p.bathroomsTo);
      return { code: 'bathrooms_short', n: have !== null && w.minBathrooms ? w.minBathrooms - have : null };
    }
    if (key === 'buildSize') return { code: 'build_size' };
    if (key === 'plotSize') return { code: 'plot_size' };
    return { code: 'feature', id: Number(key.replace('feature:', '')) };
  });
}
