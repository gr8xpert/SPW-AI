'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type BuyerText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

// The one place that picks the Contacts (Buyer Match) wording: the user's
// dashboard language.
const buyerText: Dictionaries<BuyerText> = { en, nl, es, fr, de, fi, sv };

export function useBuyerText(): BuyerText {
  return useText(buyerText);
}
