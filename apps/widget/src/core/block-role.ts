import { elementAttributes } from './attribute-parser';

// What a block on the page is for. Two kinds show properties:
//
//   the page's results area   a listing block on a page built to show a search,
//                             with at most plain search filters as a starting
//                             point — it gets the count, the sort chooser and
//                             the page numbers
//   a curated list            "our featured six", "six of ours" — it picks a
//                             selection (featured, own, limit, ref) or is
//                             standalone, and shows exactly that, with no
//                             toolbar and no paging
//
// Telling them apart is what stops a homepage carousel swallowing a search,
// and what keeps page furniture off a block that is only decoration.

// Blocks that show whatever the visitor searched for.
export const RESULT_COMPONENTS = new Set([
  'property_grid', 'property_carousel', 'pagination', 'results_count',
  'map_view', 'map_container', 'map_results_panel',
]);
const RESULT_BLOCK_RE = /^(site-listing|site-map|listing-template-\d+|map-template-\d+)$/;

// Attributes that pick a hand-chosen selection rather than describe a search:
// "our featured six", "our own listings", one reference. Plain search filters
// (for, location, type, beds, price, sort…) don't — for="sale" on a results
// page is that page's starting search, which the visitor can change, and the
// block keeps its toolbar and paging. Until 10-05 any filter made a block
// curated, so the only way to keep paging was lock-*, which also froze it.
const CURATED_ATTRS = new Set(['featured', 'own', 'own-only', 'limit', 'reference', 'ref', 'references', 'refs']);

export function isCurated(el: HTMLElement): boolean {
  if (el.hasAttribute('data-spm-standalone') || el.closest('[data-spm-standalone]')) return true;
  const attrs = Object.keys(elementAttributes(el));
  // fixed / lock-* says "this whole page is Marbella villas", not "here is a
  // list I chose". The search box on such a page must narrow within it, so the
  // block stays the page's results area rather than becoming a list of its own.
  if (attrs.some((name) => name === 'fixed' || name === 'locked' || name.startsWith('lock-'))) return false;
  return attrs.some((name) => CURATED_ATTRS.has(name));
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

const SEARCH_BLOCK_RE = /^(site-search|search-template-\d+)$/;

/**
 * Page builders put each column in its own stacking layer (Divi: every column
 * z-index 2), and the results column comes later on the page with the same
 * number, so a search dropdown opened downwards is drawn under the results'
 * sort bar and cards however high its own z-index. One step up for each
 * numbered layer holding a search block puts the search above what follows it,
 * without lifting it over the site's header or menus.
 */
export function liftSearchBlocks(): void {
  for (const block of document.querySelectorAll<HTMLElement>('[data-spm-widget]')) {
    if (!SEARCH_BLOCK_RE.test(block.getAttribute('data-spm-widget') || '')) continue;
    for (let el = block.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.dataset.spmLifted) continue;
      const z = parseInt(getComputedStyle(el).zIndex, 10);
      if (Number.isNaN(z)) continue;
      el.style.zIndex = String(z + 1);
      el.dataset.spmLifted = '1';
    }
  }
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
