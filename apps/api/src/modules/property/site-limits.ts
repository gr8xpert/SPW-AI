import type { SelectQueryBuilder } from 'typeorm';
import type { Property } from '../../database/entities';

// Site-wide limits from Settings -> Widget. They hold on the client's website
// (search, lists, map, similar, AI chat) but never in the dashboard.

export const LISTING_TYPES = ['sale', 'rent', 'holiday_rent', 'development'] as const;

// Listing Types: unticking one (say both rentals) means the site has none.
// Nothing set, or nothing valid, means every type.
export function siteListingTypes(settings: unknown): string[] | null {
  const raw = (settings as { enabledListingTypes?: unknown } | null)?.enabledListingTypes;
  if (!Array.isArray(raw)) return null;
  const types = raw.filter((t): t is string => typeof t === 'string' && (LISTING_TYPES as readonly string[]).includes(t));
  return types.length && types.length < LISTING_TYPES.length ? types : null;
}

export type SiteMinPrices = Partial<Record<(typeof LISTING_TYPES)[number], number>>;

// Price Dropdown Options -> "Hide properties below", per listing type
// (2026-10-05, Cristi Homes: sales from 200k, rents from 500). Only positive
// numbers count; nothing set means no floor.
export function siteMinPrices(settings: unknown): SiteMinPrices | null {
  const raw = (settings as { minPrices?: unknown } | null)?.minPrices;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: SiteMinPrices = {};
  for (const type of LISTING_TYPES) {
    const n = Number((raw as Record<string, unknown>)[type]);
    if (Number.isFinite(n) && n > 0) out[type] = n;
  }
  return Object.keys(out).length ? out : null;
}

// Hides a type's listings priced below its floor. Listings without a price
// (none, 0, or price on request) stay: the floor is about cheap listings, not
// unpriced ones.
export function applySiteMinPrices(qb: SelectQueryBuilder<Property>, mins: SiteMinPrices | null | undefined): void {
  if (!mins) return;
  for (const [type, min] of Object.entries(mins)) {
    if (!(min > 0)) continue;
    qb.andWhere(
      `NOT (p.listingType = :floorType_${type} AND p.priceOnRequest = 0 AND COALESCE(p.price, 0) > 0 AND p.price < :floorMin_${type})`,
      { [`floorType_${type}`]: type, [`floorMin_${type}`]: min },
    );
  }
}

