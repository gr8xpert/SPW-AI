import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import type { CardProps } from './useCardState';

export type CardComponent = ComponentType<CardProps>;

// Each listing template has its own card design in its own module, so a page
// only downloads the design it shows. Key 0 is the standard card, used by
// templates 01 and 11 and by any grid or carousel whose `template` is not one
// of the numbers below. (The ListingTemplateNN wrappers pass their number
// after the page's attributes: a `data-spm-template="listing-template-07"`
// used to arrive as the string `template` and override it, giving block 07
// the standard card.)
const DEFAULT_CARD = 0;

const loaders: Record<number, () => Promise<{ default: CardComponent }>> = {
  [DEFAULT_CARD]: () => import('./CardDefault'),
  2: () => import('./CardOverlay'),
  3: () => import('./CardBlend'),
  4: () => import('./CardCompact'),
  5: () => import('./CardShowcase'),
  6: () => import('./CardElegant'),
  7: () => import('./CardImmersive'),
  8: () => import('./CardCountry'),
  9: () => import('./CardRustic'),
  10: () => import('./CardMetro'),
  12: () => import('./CardLocationFirst'),
  13: () => import('./CardClassic').then((m) => ({ default: m.Card13 })),
  14: () => import('./CardClassic').then((m) => ({ default: m.Card14 })),
  15: () => import('./CardClassic').then((m) => ({ default: m.Card15 })),
  16: () => import('./CardClassic').then((m) => ({ default: m.Card16 })),
  17: () => import('./CardClassic').then((m) => ({ default: m.Card17 })),
};

const loaded = new Map<number, CardComponent>();

function cardKey(template: unknown): number {
  return typeof template === 'number' && template !== DEFAULT_CARD && template in loaders
    ? template
    : DEFAULT_CARD;
}

/**
 * A listing template imports its card statically and hands it over here, so
 * the card is ready on the first render (no loading flash).
 */
export function provideCard(template: number, card: CardComponent): void {
  loaded.set(cardKey(template), card);
}

/**
 * The card design for `template`. Returns null while a design nobody provided
 * yet is being fetched; the caller shows its loading skeleton meanwhile.
 */
export function useCardDesign(template: unknown): CardComponent | null {
  const key = cardKey(template);
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (loaded.has(key)) return;
    let alive = true;
    loaders[key]().then(
      (mod) => {
        loaded.set(key, mod.default);
        if (alive) setVersion((v) => v + 1);
      },
      (err) => console.error('[SPM] Failed to load card design', key, err),
    );
    return () => { alive = false; };
  }, [key]);

  return loaded.get(key) ?? null;
}
