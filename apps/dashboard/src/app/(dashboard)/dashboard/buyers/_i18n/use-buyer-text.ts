import { en, type BuyerText } from './en';

// The one place that picks the Buyer Match wording. English only for now;
// another language = another file like en.ts, chosen here.
export function useBuyerText(): BuyerText {
  return en;
}
