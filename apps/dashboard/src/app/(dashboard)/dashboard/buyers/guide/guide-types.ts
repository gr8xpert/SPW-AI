import type { LucideIcon } from 'lucide-react';

// One piece of a guide section. Kept as plain data so the page can search it.
export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'terms'; items: [term: string, meaning: string][] }
  | { kind: 'tip'; text: string }
  | { kind: 'warn'; text: string };

// Every section of the guide, in reading order. Each language must have all.
export const SECTION_IDS = [
  'what', 'quick-start', 'words', 'list', 'new-buyer', 'new-leads', 'record', 'details', 'wishlist', 'matched', 'suggested', 'sending',
  'whatsapp', 'ai', 'more-tabs', 'my-day', 'lead-report', 'board', 'alerts', 'calendar', 'reverse', 'reports', 'settings', 'import',
  'privacy', 'who-sees', 'faq',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

// The headings the sections are grouped under; their names are in guide-text.ts.
export type GuideGroup = 'start' | 'buyers' | 'one' | 'day' | 'managers' | 'help';

export type GuideSection = {
  id: SectionId;
  group: GuideGroup;
  title: string;
  icon: LucideIcon;
  summary: string;
  managersOnly?: boolean;
  link?: { href: string; label: string };
  blocks: GuideBlock[];
};

// The words of one section in one language. Icon, group, link address and
// managersOnly always come from the English source (guide-basics/guide-more).
export type GuideSectionText = {
  title: string;
  summary: string;
  linkLabel?: string;
  blocks: GuideBlock[];
};

export type GuideTranslation = Record<SectionId, GuideSectionText>;

export const p = (text: string): GuideBlock => ({ kind: 'p', text });
export const steps = (...items: string[]): GuideBlock => ({ kind: 'steps', items });
export const terms = (...items: [string, string][]): GuideBlock => ({ kind: 'terms', items });
export const tip = (text: string): GuideBlock => ({ kind: 'tip', text });
export const warn = (text: string): GuideBlock => ({ kind: 'warn', text });

// Everything a section says, for the search box.
export function sectionText(s: GuideSection): string {
  const parts = [s.title, s.summary];
  for (const b of s.blocks) {
    if (b.kind === 'steps') parts.push(...b.items);
    else if (b.kind === 'terms') for (const [a, m] of b.items) parts.push(a, m);
    else parts.push(b.text);
  }
  return parts.join(' ').toLowerCase();
}
