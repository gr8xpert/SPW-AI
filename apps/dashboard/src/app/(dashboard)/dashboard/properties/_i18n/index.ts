'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type PropertiesText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { PropertiesText };

const propertiesText: Dictionaries<PropertiesText> = { en, nl, es, fr, de, fi, sv };

export function usePropertiesText(): PropertiesText {
  return useText(propertiesText);
}

/** A label from one of the text maps by a code from the API, or the code itself. */
export function labelOf(map: object, code: string | null | undefined, fallback?: string): string {
  if (!code) return fallback ?? '';
  return (map as Record<string, string>)[code] ?? fallback ?? code;
}
