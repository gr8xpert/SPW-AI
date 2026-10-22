'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type SettingsText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { SettingsText };

export const settingsText: Dictionaries<SettingsText> = { en, nl, es, fr, de, fi, sv };

/** The Settings page wording in the dashboard language. */
export function useSettingsText(): SettingsText {
  return useText(settingsText);
}

/** A website language's name in the dashboard language (undefined if unknown). */
export function languageName(t: SettingsText, code: string): string | undefined {
  return (t.languageNames as Record<string, string>)[code];
}
