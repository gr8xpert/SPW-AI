'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type LabelsText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { LabelsText };

const labelsText: Dictionaries<LabelsText> = { en, nl, es, fr, de, fi, sv };

export function useLabelsText(): LabelsText {
  return useText(labelsText);
}

/** A name from one of the text maps by a code, or the fallback / code itself. */
export function nameOf(map: object, code: string, fallback?: string): string {
  return (map as Record<string, string>)[code] ?? fallback ?? code;
}
