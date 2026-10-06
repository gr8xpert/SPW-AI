import type { SearchFilters, LockedFilters } from '@/types';
import { filtersFromAttributes } from './filter-attributes';

export { filtersFromAttributes, normaliseSort } from './filter-attributes';

// Filters written on the page itself (on any SPM block): the same words on
// every platform — WordPress, Wix, Squarespace, Next.js or plain HTML.
//
//   <div data-spm-widget="listing-template-01" data-spm-location="5216585"
//        data-spm-under="500000" data-spm-beds="3"></div>
//
// Plain filters are a starting point the visitor can change; with
// data-spm-fixed (or the older data-spm-lock-*) they are fixed.
// A block with data-spm-standalone keeps its filters to itself
// (see useBlockSearch), so one page can hold several different lists.

// Every word filtersFromAttributes() answers to, including the alternatives —
// a block whose ONLY filter is an alias missing from this list is never found,
// and its filter silently disappears (that is what happened to `ref`).
const SELECTOR = [
  'location', 'area', 'town', 'type', 'property-type', 'features', 'feature',
  'for', 'listing-type', 'beds', 'bedrooms', 'baths', 'bathrooms', 'price',
  'under', 'over', 'from', 'built', 'built-area', 'plot', 'plot-size',
  'terrace', 'terrace-size', 'reference', 'ref', 'references', 'refs', 'featured', 'own', 'own-only',
  'own-first', 'sort', 'order', 'limit', 'page',
  'min-price', 'max-price', 'min-bedrooms', 'max-bedrooms', 'min-bathrooms', 'max-bathrooms',
  'min-build-size', 'max-build-size', 'min-plot-size', 'max-plot-size', 'min-terrace-size', 'max-terrace-size',
]
  .flatMap((name) => [`[data-spm-${name}]`, `[data-spm-lock-${name}]`])
  .join(', ');

// Carousels always search on their own, as the V3 carousels did: a homepage
// slider of featured villas never becomes the page's search.
const OWN_SEARCH_BLOCK_RE = /^(site-carousel|carousel-template-\d+)$/;
const REF_ATTRS = ['data-spm-ref', 'data-spm-reference', 'data-spm-refs', 'data-spm-references'];

export function isStandalone(el: HTMLElement): boolean {
  if (el.hasAttribute('data-spm-standalone') || el.closest('[data-spm-standalone]')) return true;
  const block = el.closest<HTMLElement>('[data-spm-widget], [data-spm-template]');
  const name = block?.getAttribute('data-spm-widget') || block?.getAttribute('data-spm-template') || '';
  // A hand-picked list of references is always its own list.
  if (block && REF_ATTRS.some((a) => block.hasAttribute(a))) return true;
  return OWN_SEARCH_BLOCK_RE.test(name);
}

/** data-spm-* attributes of one element, keyed without the prefix. */
export function elementAttributes(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (!attr.name.startsWith('data-spm-')) continue;
    out[attr.name.slice('data-spm-'.length)] = attr.value;
  }
  return out;
}

function collect(root: HTMLElement, wantFixed: boolean): SearchFilters {
  const out: SearchFilters = {};
  for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) {
    if (isStandalone(el)) continue;
    const { filters, fixed } = filtersFromAttributes(elementAttributes(el));
    if (fixed !== wantFixed) continue;
    Object.assign(out, filters);
  }
  return out;
}

/** Starting values for the page's search (the visitor can change them). */
export function parsePrefilledFilters(root: HTMLElement = document.documentElement): SearchFilters {
  return collect(root, false);
}

/** Filters the visitor cannot change. */
export function parseLockedFilters(root: HTMLElement = document.documentElement): LockedFilters {
  return collect(root, true) as LockedFilters;
}
