'use client';

import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { en, type WebsiteDesignText } from './en';
import { nl } from './nl';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { fi } from './fi';
import { sv } from './sv';

export type { WebsiteDesignText };

const websiteDesignText: Dictionaries<WebsiteDesignText> = { en, nl, es, fr, de, fi, sv };

export function useWebsiteDesignText(): WebsiteDesignText {
  return useText(websiteDesignText);
}

/** A design's name by its template id, or the id itself if it has none. */
export function templateName(t: WebsiteDesignText, id: string): string {
  return (t.templates as Record<string, string>)[id] ?? id;
}
