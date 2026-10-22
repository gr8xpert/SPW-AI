'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type SharedText, type SetupKind } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { SharedText, SetupKind };

const sharedText: Dictionaries<SharedText> = { en, nl, es, fr, de, fi, sv };

/** Wording of the shared components used on client pages. */
export function useSharedText(): SharedText {
  return useText(sharedText);
}
