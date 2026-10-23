'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type EditorText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { EditorText };

export const editorText: Dictionaries<EditorText> = { en, nl, es, fr, de, fi, sv };

/** The template editor wording in the dashboard language. */
export function useEditorText(): EditorText {
  return useText(editorText);
}
