// One way to write a listing's price on the server (inquiry emails, brochure),
// matching the widget's formatPropertyPrice:
//   "€45,000"   ·   "€1,750 – €2,450 / week"   ·   "Price on request"
// A range shows only when priceTo is higher than price. Works for every
// listing type; the period comes from the listing, and a long-term rental
// without one is taken as monthly.

export type PricePeriod = 'night' | 'week' | 'month';

export interface PriceInput {
  price: number | string | null;
  priceTo?: number | string | null;
  rentalPeriod?: string | null;
  priceOnRequest?: boolean;
  currency?: string | null;
  listingType?: string | null;
}

export interface PriceWords {
  onRequest?: string;
  per?: Partial<Record<PricePeriod, string>>; // "week" → "semana"
}

export function pricePeriod(p: Pick<PriceInput, 'rentalPeriod' | 'listingType'>): PricePeriod | null {
  if (p.rentalPeriod === 'night' || p.rentalPeriod === 'week' || p.rentalPeriod === 'month') return p.rentalPeriod;
  return p.listingType === 'rent' ? 'month' : null;
}

export function priceText(p: PriceInput, language = 'en', words: PriceWords = {}): string {
  const from = Number(p.price ?? 0);
  if (p.priceOnRequest || !(from > 0)) return words.onRequest || 'Price on request';
  const to = Number(p.priceTo ?? 0);
  const money = (n: number) => {
    try {
      return new Intl.NumberFormat(language || 'en', {
        style: 'currency',
        currency: p.currency || 'EUR',
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${n.toLocaleString('en')} ${p.currency || ''}`.trim();
    }
  };
  let text = money(from);
  if (to > from) text += ` – ${money(to)}`;
  const period = pricePeriod(p);
  if (period) text += ` / ${words.per?.[period] || period}`;
  return text;
}
