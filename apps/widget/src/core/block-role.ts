import { elementAttributes } from './attribute-parser';

// What a block on the page is for. Two kinds show properties:
//
//   the page's results area   a listing block with no filters of its own, on a
//                             page built to show a search — it gets the count,
//                             the sort chooser and the page numbers
//   a curated list            "our featured six", "latest in Marbella" — it
//                             carries its own filters and shows exactly that,
//                             with no toolbar and no paging
//
// Telling them apart is what stops a homepage carousel swallowing a search,
// and what keeps page furniture off a block that is only decoration.

// Blocks that show whatever the visitor searched for.
export const RESULT_COMPONENTS = new Set([
  'property_grid', 'property_carousel', 'pagination', 'results_count',
  'map_view', 'map_container', 'map_results_panel',
]);
const RESULT_BLOCK_RE = /^(site-listing|site-map|listing-template-\d+|map-template-\d+)$/;

// Attributes that say how a block looks, not what it holds.
const PRESENTATION_ATTRS = new Set([
  'widget', 'template', 'variation', 'currency', 'lang', 'language', 'standalone', 'columns',
]);

export function isCurated(el: HTMLElement): boolean {
  if (el.hasAttribute('data-spm-standalone') || el.closest('[data-spm-standalone]')) return true;
  const attrs = Object.keys(elementAttributes(el));
  // fixed / lock-* says "this whole page is Marbella villas", not "here is a
  // list I chose". The search box on such a page must narrow within it, so the
  // block stays the page's results area rather than becoming a list of its own.
  if (attrs.some((name) => name === 'fixed' || name === 'locked' || name.startsWith('lock-'))) return false;
  return attrs.some((name) => !PRESENTATION_ATTRS.has(name));
}

export function showsResults(el: HTMLElement): boolean {
  const name = el.getAttribute('data-spm-widget') || '';
  return RESULT_BLOCK_RE.test(name) || RESULT_COMPONENTS.has(name);
}

/** The block a search on this page is meant to fill. */
export function isPageResults(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  const block = el.closest<HTMLElement>('[data-spm-widget]');
  return !!block && showsResults(block) && !isCurated(block);
}

/**
 * On a page with nowhere to show a search — a homepage carrying only a search
 * box and a curated list — that list is given its own search, so its filters
 * stay its own instead of becoming the page's and travelling with the visitor
 * to the results page.
 */
export function markCuratedBlocksStandalone(): void {
  const blocks = [...document.querySelectorAll<HTMLElement>('[data-spm-widget]')];
  if (blocks.some((el) => showsResults(el) && !isCurated(el))) return;
  for (const el of blocks) {
    if (showsResults(el) && isCurated(el)) el.setAttribute('data-spm-standalone', '');
  }
}
