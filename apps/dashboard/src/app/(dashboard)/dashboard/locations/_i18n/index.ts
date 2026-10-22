'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type LocationsText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { LocationsText };

const locationsText: Dictionaries<LocationsText> = { en, nl, es, fr, de, fi, sv };

export function useLocationsText(): LocationsText {
  return useText(locationsText);
}

/** A name from one of the text maps by a code, or the fallback / code itself. */
export function nameOf(map: object, code: string, fallback?: string): string {
  return (map as Record<string, string>)[code] ?? fallback ?? code;
}
