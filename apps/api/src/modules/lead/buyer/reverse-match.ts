import type { BuyerWishlist } from '@spm/shared';
import { isEmptyWishlist, matchListingTypes } from './buyer-match';

// Reverse match: does this one listing meet a buyer's must-haves? The same
// rules BuyerMatchService runs in SQL (website search rules: live, the
// site's listing types and price floors, places and types with everything
// below them, budget overlap), in code, so one listing can be checked
// against every buyer. Places/types come in already expanded. Pure.

export interface ReverseListing {
  listingType: string;
  locationId: number | null;
  propertyTypeId: number | null;
  price: number | string | null;
  priceTo: number | string | null;
  priceOnRequest: boolean;
  status: string;
  isPublished: boolean;
}

export interface ReverseContext {
  // The wishlist's places / types with all their descendants; null = not asked.
  places: Set<number> | null;
  types: Set<number> | null;
  siteTypes: string[] | null;
  minPrices: Record<string, number> | null;
}

export function wishlistAccepts(w: BuyerWishlist, p: ReverseListing, ctx: ReverseContext): boolean {
  if (isEmptyWishlist(w)) return false;
  if (p.status !== 'active' || !p.isPublished) return false;

  const types = matchListingTypes(w, ctx.siteTypes);
  if (types && !types.includes(p.listingType)) return false;

  const price = Number(p.price ?? 0);
  const priced = !p.priceOnRequest && price > 0;
  const floor = ctx.minPrices?.[p.listingType];
  if (floor && priced && price < floor) return false;

  if (w.locationIds?.length && (p.locationId == null || !ctx.places?.has(p.locationId))) return false;
  if (w.propertyTypeIds?.length && (p.propertyTypeId == null || !ctx.types?.has(p.propertyTypeId))) return false;

  if (w.budgetMin || w.budgetMax) {
    if (!priced) return false;
    const top = Math.max(price, Number(p.priceTo ?? 0) || 0);
    if (w.budgetMin && top < w.budgetMin) return false;
    if (w.budgetMax && price > w.budgetMax) return false;
  }
  return true;
}
