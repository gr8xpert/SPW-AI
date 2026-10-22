'use client';

import { useMemo } from 'react';
import { useText } from '@/i18n/i18n-provider';
import type { Dictionaries } from '@/i18n/languages';
import { BASICS } from './guide-basics';
import { MORE } from './guide-more';
import type { GuideSection, GuideTranslation } from './guide-types';
import { nl } from './content/nl';
import { es } from './content/es';
import { fr } from './content/fr';
import { de } from './content/de';
import { fi } from './content/fi';
import { sv } from './content/sv';

// English is the source: it holds the icons, groups, link addresses and
// managersOnly flags. The other languages only carry the words.
export const SECTIONS: GuideSection[] = [...BASICS, ...MORE];

const en = Object.fromEntries(
  SECTIONS.map((s) => [s.id, { title: s.title, summary: s.summary, linkLabel: s.link?.label, blocks: s.blocks }]),
) as GuideTranslation;

const guides: Dictionaries<GuideTranslation> = { en, nl, es, fr, de, fi, sv };

/** The guide sections in the user's dashboard language. */
export function useGuideSections(): GuideSection[] {
  const words = useText(guides);
  return useMemo(
    () =>
      SECTIONS.map((s) => {
        const t = words[s.id];
        return {
          ...s,
          title: t.title,
          summary: t.summary,
          blocks: t.blocks,
          link: s.link ? { href: s.link.href, label: t.linkLabel ?? s.link.label } : undefined,
        };
      }),
    [words],
  );
}
