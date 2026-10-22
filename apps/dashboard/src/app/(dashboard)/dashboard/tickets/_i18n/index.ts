'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type TicketsText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { TicketsText };

export const ticketsText: Dictionaries<TicketsText> = { en, nl, es, fr, de, fi, sv };

/** The Support Tickets wording in the dashboard language. */
export function useTicketsText(): TicketsText {
  return useText(ticketsText);
}

/** A short date (e.g. 1 apr. 2026) in the given locale; the raw value if unparsable. */
export function formatTicketDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}
