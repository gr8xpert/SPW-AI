import type { WidgetConfig } from '@/types';

// Search tabs with a page each: "All" → resultsPage (/properties/), and every
// listing type the client gave its own page (/holiday-rentals/,
// /new-developments/ …) → resultsPages[type]. The WordPress plugin sends both
// for the page's language. A search always lands on the page of the tab it
// was made on, so the address matches what is shown.

export type TabPages = Partial<Record<'sale' | 'development' | 'rent' | 'holiday_rent', string>>;

export interface ResultsTarget {
  url: string;
  // true = the page is that listing type's own page, which sets the type
  // itself; false = the All page, which needs the type in the address.
  dedicated: boolean;
}

/** True when the client set up at least one per-tab page. */
export function hasTabPages(config: Pick<WidgetConfig, 'resultsPages'>): boolean {
  return Object.values(config.resultsPages || {}).some(Boolean);
}

export function resultsPageFor(
  listingType: string | undefined,
  config: Pick<WidgetConfig, 'resultsPage' | 'resultsPages'>,
): ResultsTarget | null {
  const own = listingType ? (config.resultsPages as Record<string, string | undefined> | undefined)?.[listingType] : undefined;
  if (own) return { url: own, dedicated: true };
  return config.resultsPage ? { url: config.resultsPage, dedicated: false } : null;
}

const normalize = (path: string) => path.replace(/\/+$/, '') || '/';

/** Is `url` the page the visitor is on? (trailing slashes ignored) */
export function isCurrentPage(url: string): boolean {
  try {
    return normalize(new URL(url, window.location.href).pathname) === normalize(window.location.pathname);
  } catch {
    return false;
  }
}
