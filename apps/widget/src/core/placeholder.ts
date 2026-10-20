// What an empty block shows between the script running and its design
// drawing. A listing gets a full grid of skeleton cards (and, on the results
// page, the results bar) so the page below it doesn't move twice while the
// design and the results load (PageSpeed layout shift, 2026-10-20).

const LISTING_GRID_RE = /^(listing-template-\d{2}|property_grid)$/;

export function isGridListing(componentType: string): boolean {
  return LISTING_GRID_RE.test(componentType);
}

/** Same markup as RsResultsShell + <Skeleton type="card"> in RsPropertyGrid. */
export function cardSkeletonHTML(count: number, withBar: boolean): string {
  const n = Math.min(Math.max(Math.floor(count) || 12, 1), 48);
  let cards = '';
  for (let i = 0; i < n; i++) {
    cards += `<div class="rs-skeleton-card" style="--i:${i}"><div class="rs-skeleton rs-skeleton--image"></div>`
      + '<div class="rs-skeleton-card__body"><div class="rs-skeleton rs-skeleton--text" style="width:60%"></div>'
      + '<div class="rs-skeleton rs-skeleton--text" style="width:40%"></div>'
      + '<div class="rs-skeleton rs-skeleton--text" style="width:80%"></div></div></div>';
  }
  const grid = `<div class="rs-property-grid"><div class="rs-skeleton-grid">${cards}</div></div>`;
  return withBar
    ? `<div class="rs-results"><div class="rs-results__bar rs-results__bar--placeholder"><div class="rs-skeleton" style="width:220px;height:1.25em"></div></div>${grid}</div>`
    : grid;
}

const SEARCH_RE = /^search-template-(\d{2})$/;

/**
 * A search design's placeholder: one bar, in a box as tall as the design
 * will be (heights per design and screen size in animations.css), so the
 * results under it don't move when the search box draws.
 */
export function searchPlaceholderHTML(componentType: string): string | null {
  const m = SEARCH_RE.exec(componentType);
  if (!m) return null;
  return `<div class="rs-search-placeholder rs-search-placeholder--${m[1]}"><div class="rs-skeleton" style="height:42px"></div></div>`;
}
