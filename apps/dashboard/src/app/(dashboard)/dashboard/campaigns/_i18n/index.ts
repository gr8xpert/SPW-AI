'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type CampaignsText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { CampaignsText };

export const campaignsText: Dictionaries<CampaignsText> = { en, nl, es, fr, de, fi, sv };

/** The Email Campaigns wording in the dashboard language. */
export function useCampaignsText(): CampaignsText {
  return useText(campaignsText);
}

/** A percentage with one decimal in the given locale (e.g. 36,5 in nl). */
export function formatRate(value: number, locale: string): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** A short date (e.g. 1 apr. 2026) in the given locale; the raw value if unparsable. */
export function formatShortDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}
