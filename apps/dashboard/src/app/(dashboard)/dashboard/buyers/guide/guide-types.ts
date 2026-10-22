import type { LucideIcon } from 'lucide-react';

// One piece of a guide section. Kept as plain data so the page can search it.
export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'terms'; items: [term: string, meaning: string][] }
  | { kind: 'tip'; text: string }
  | { kind: 'warn'; text: string };

export type GuideSection = {
  id: string;
  group: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  managersOnly?: boolean;
  link?: { href: string; label: string };
  blocks: GuideBlock[];
};

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
