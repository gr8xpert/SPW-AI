'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type FeedsText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { FeedsText };

const feedsText: Dictionaries<FeedsText> = { en, nl, es, fr, de, fi, sv };

export function useFeedsText(): FeedsText {
  return useText(feedsText);
}
