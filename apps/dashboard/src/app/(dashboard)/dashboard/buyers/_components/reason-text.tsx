'use client';

import { useBuyerText } from '../_i18n/use-buyer-text';
import { nameOf, useMatchOptions, type NearMissReason, type WishReason } from '../use-buyer-match';

function money(amount: number, currency: string): string {
  // €15k, €1.2M: short enough for a table cell.
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  } catch {
    return `${Math.round(amount / 1000)}k`;
  }
}

// Reasons in words: "1 bedroom short", "no Pool", "€15k over budget",
// "next town over: Benahavís (6 km)".
export function useReasonText() {
  const t = useBuyerText().reasons;
  const features = useMatchOptions('features');
  const wish = (r: WishReason): string => {
    switch (r.code) {
      case 'bedrooms_short':
        return t.bedroomsShort(r.n);
      case 'bathrooms_short':
        return t.bathroomsShort(r.n);
      case 'build_size':
        return t.buildSize;
      case 'plot_size':
        return t.plotSize;
      default:
        return t.feature(nameOf(features.data?.find((f) => f.id === r.id)?.name) || `#${r.id}`);
    }
  };
  const miss = (r: NearMissReason, currency: string): string => {
    if (r.code === 'over_budget') return t.over(money(r.amount, currency));
    if (r.code === 'under_budget') return t.under(money(r.amount, currency));
    return t.nearby(r.place, r.km);
  };
  return { wish, miss };
}
