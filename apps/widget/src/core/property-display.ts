import type { Property, WidgetConfig } from '@/types';

// Returns the reference to display on cards + detail. When the tenant enabled
// useAgentReferenceAsDisplay AND the property has an agentReference (MLSC-style
// client number), that wins. Otherwise falls back to the widget's own reference.
// URL slugs and API lookups must always use property.reference — this is a
// display-only accessor.
export function getDisplayReference(
  property: Pick<Property, 'reference' | 'agentReference'>,
  config: Pick<WidgetConfig, 'useAgentReferenceAsDisplay'>,
): string {
  if (config.useAgentReferenceAsDisplay && property.agentReference?.trim()) {
    return property.agentReference;
  }
  return property.reference;
}

// ── Price ────────────────────────────────────────────────────────────────
// One rule for every listing type and every place a price shows (cards,
// carousel, detail, related, map, wishlist, PDF, chat):
//   "€45,000"   ·   "€1,750 – €2,450 / week"   ·   "Price on request"
// A range shows only when priceTo is higher than price; the period comes from
// the listing (Resales RentalPeriod, Kyero price_freq, dashboard), and a
// long-term rental without one is taken as monthly. Mirrors the API's
// price-text.ts (inquiry emails, brochure).

export type PricePeriod = 'night' | 'week' | 'month';

// Structural, so map points and other partial listings work too.
export interface PriceFields {
  price?: number | string | null;
  priceTo?: number | string | null;
  rentalPeriod?: string | null;
  priceOnRequest?: boolean;
  listingType?: string;
}
type Translate = (key: string, fallback?: string) => string;

/** False when the listing shows "Price on request" instead of an amount. */
export function hasPrice(p: PriceFields): boolean {
  return !p.priceOnRequest && Number(p.price) > 0;
}

/** The "to" amount, only when it is a real range. */
export function priceTo(p: PriceFields): number | null {
  const to = Number(p.priceTo ?? 0);
  return to > Number(p.price) ? to : null;
}

export function pricePeriod(p: PriceFields): PricePeriod | null {
  if (p.rentalPeriod === 'night' || p.rentalPeriod === 'week' || p.rentalPeriod === 'month') return p.rentalPeriod;
  return p.listingType === 'rent' ? 'month' : null;
}

/** " / week" in the visitor's language, or "" for a plain price. */
export function priceSuffix(p: PriceFields, t: Translate): string {
  const period = pricePeriod(p);
  if (!period) return '';
  const word = { night: t('price_per_night', 'night'), week: t('price_per_week', 'week'), month: t('price_per_month', 'month') }[period];
  return ` / ${word}`;
}

/** The whole price as text. `money` formats one amount (currency conversion). */
export function formatPropertyPrice(
  p: PriceFields,
  money: (n: number) => string,
  t: Translate,
  onRequest = t('price_on_request', 'Price on Request'),
): string {
  if (!hasPrice(p)) return onRequest;
  const to = priceTo(p);
  return `${money(Number(p.price))}${to ? ` – ${money(to)}` : ''}${priceSuffix(p, t)}`;
}

// ── Ranges on specs ───────────────────────────────────────────────────────
// A development is a range: 1–3 beds, 39–107 m². Each spec has a *To field,
// shown only when higher than the from value.
export type SpecKey = 'bedrooms' | 'bathrooms' | 'buildSize' | 'plotSize' | 'terraceSize';

type SpecFields = Partial<Record<SpecKey | `${SpecKey}To`, number | string | null>>;

const AREA_SPECS = new Set<SpecKey>(['buildSize', 'plotSize', 'terraceSize']);

/**
 * "3", "2.5", "1–3" or, for areas, "39–107" (rounded). Null when the listing
 * has no value above 0, so callers can keep their `> 0` checks out.
 */
export function specRange(p: SpecFields, key: SpecKey): string | null {
  const from = Number(p[key]);
  if (!Number.isFinite(from) || from <= 0) return null;
  const to = Number(p[`${key}To`]);
  const show = (n: number) => String(AREA_SPECS.has(key) ? Math.round(n) : Math.round(n * 10) / 10);
  return Number.isFinite(to) && to > from ? `${show(from)}–${show(to)}` : show(from);
}
