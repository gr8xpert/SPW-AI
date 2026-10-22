'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type FeedExportText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { FeedExportText };

// Shared by the Feed Export page and every card in components/feed-export.
const feedExportText: Dictionaries<FeedExportText> = { en, nl, es, fr, de, fi, sv };

export function useFeedExportText(): FeedExportText {
  return useText(feedExportText);
}
