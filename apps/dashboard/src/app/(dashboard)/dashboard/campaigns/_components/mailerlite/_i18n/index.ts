'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type MailerLiteText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { MailerLiteText };

export const mailerLiteText: Dictionaries<MailerLiteText> = { en, nl, es, fr, de, fi, sv };

/** The MailerLite card's wording in the dashboard language. */
export function useMailerLiteText(): MailerLiteText {
  return useText(mailerLiteText);
}
