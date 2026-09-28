import type { SearchFilters } from '@/types';
import { normaliseSort } from './filter-attributes';

// Search filters <-> URL query string. Lets a search box on one page (e.g. the
// homepage) send the visitor to the results page with the search applied, and
// makes a results page shareable: after every search the page's own URL is
// rewritten to match what is on screen. Paging and map viewport are
// page-local, so they stay out.
//
// The parameter names are the ones a site builder already knows from the
// shortcode and data attributes (`location`, `for`, `beds`, `min-price`), and
// list values carry the name alongside the id ("marbella-12") so a shared link
// reads like the search it represents. Links written by older releases used
// the raw API names (locationId, maxPrice, …); those are still read.

interface Named { id: number; name: string }
export interface NameLists {
  locations?: Named[];
  propertyTypes?: Named[];
  features?: Named[];
}

// pretty name -> filter key
const NUMBER_PARAMS: Record<string, keyof SearchFilters> = {
  'min-price': 'minPrice',
  'max-price': 'maxPrice',
  'beds': 'minBedrooms',
  'max-beds': 'maxBedrooms',
  'baths': 'minBathrooms',
  'max-baths': 'maxBathrooms',
  'min-built': 'minBuildSize',
  'max-built': 'maxBuildSize',
  'min-plot': 'minPlotSize',
  'max-plot': 'maxPlotSize',
  'min-terrace': 'minTerraceSize',
  'max-terrace': 'maxTerraceSize',
};
const STRING_PARAMS: Record<string, keyof SearchFilters> = {
  q: 'query',
  for: 'listingType',
  reference: 'reference',
  sort: 'sortBy',
};
// pretty name -> [single-id key, id-list key, which list names come from]
const LIST_PARAMS: Array<[string, keyof SearchFilters, keyof SearchFilters | null, keyof NameLists | null]> = [
  ['location', 'locationId', 'locationIds', 'locations'],
  ['type', 'propertyTypeId', 'propertyTypeIds', 'propertyTypes'],
  ['features', 'features', null, 'features'],
];

// The API names older links used, still accepted when reading.
const LEGACY_NUMBERS = [
  'locationId', 'propertyTypeId', 'minPrice', 'maxPrice',
  'minBedrooms', 'maxBedrooms', 'minBathrooms', 'maxBathrooms',
  'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize',
  'minTerraceSize', 'maxTerraceSize',
] as const;
const LEGACY_LISTS = ['locationIds', 'propertyTypeIds', 'features'] as const;
const LEGACY_STRINGS = ['query', 'listingType', 'reference', 'sortBy'] as const;

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "marbella-12" / "12" -> 12. The id is always the trailing number, so a name
// that itself ends in digits ("golf-park-2-14") still resolves.
function idFromToken(token: string): number | null {
  const match = /(\d+)$/.exec(token.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function token(id: number, list?: Named[]): string {
  const name = list?.find((item) => item.id === id)?.name;
  const slug = name ? slugify(name) : '';
  return slug ? `${slug}-${id}` : String(id);
}

export function filtersToQuery(filters: SearchFilters, lists: NameLists = {}): string {
  const params = new URLSearchParams();
  const f = filters as Record<string, unknown>;

  for (const [param, key] of Object.entries(STRING_PARAMS)) {
    const v = f[key];
    if (v !== undefined && v !== null && v !== '') params.set(param, String(v));
  }
  for (const [param, key] of Object.entries(NUMBER_PARAMS)) {
    const v = f[key];
    if (v !== undefined && v !== null && v !== '') params.set(param, String(v));
  }
  for (const [param, singleKey, listKey, listName] of LIST_PARAMS) {
    const list = listName ? lists[listName] : undefined;
    const many = listKey ? f[listKey] : f[singleKey];
    const ids = Array.isArray(many) ? (many as number[]) : [];
    if (ids.length) {
      params.set(param, ids.map((id) => token(id, list)).join(','));
      continue;
    }
    const one = f[singleKey];
    if (typeof one === 'number' && one > 0) params.set(param, token(one, list));
  }
  if (filters.isFeatured) params.set('featured', '1');
  return params.toString();
}

export function filtersFromQuery(search: string = window.location.search): SearchFilters {
  const params = new URLSearchParams(search);
  const out: Record<string, unknown> = {};

  const readNumber = (param: string, key: keyof SearchFilters) => {
    const v = params.get(param);
    if (v === null || v === '') return;
    const n = Number(v);
    if (Number.isFinite(n)) out[key] = n;
  };
  const readString = (param: string, key: keyof SearchFilters) => {
    const v = params.get(param);
    if (v) out[key] = v;
  };

  for (const [param, key] of Object.entries(STRING_PARAMS)) readString(param, key);
  for (const [param, key] of Object.entries(NUMBER_PARAMS)) readNumber(param, key);
  for (const key of LEGACY_STRINGS) readString(key, key);
  for (const key of LEGACY_NUMBERS) readNumber(key, key);

  // A shared link may say "newest"; the API only knows create_date_desc. An
  // order it cannot place is dropped rather than sent, which would 400 the
  // whole search.
  if (typeof out.sortBy === 'string') {
    const sort = normaliseSort(out.sortBy);
    if (sort) out.sortBy = sort;
    else delete out.sortBy;
  }

  for (const [param, singleKey, listKey] of LIST_PARAMS) {
    const raw = params.get(param);
    if (!raw) continue;
    const ids = raw.split(',').map(idFromToken).filter((n): n is number => n !== null);
    if (!ids.length) continue;
    if (!listKey) out[singleKey] = ids;
    else if (ids.length === 1) out[singleKey] = ids[0];
    else out[listKey] = ids;
  }
  for (const key of LEGACY_LISTS) {
    const raw = params.get(key);
    if (!raw || out[key] !== undefined) continue;
    const ids = raw.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length) out[key] = ids;
  }

  if (params.get('featured') === '1' || params.get('isFeatured') === 'true') out.isFeatured = true;
  return out as SearchFilters;
}

/**
 * Rewrites the current page's URL so it carries the search on screen. Uses
 * replaceState: a search is a change of view, not a new page, and pushing
 * every keystroke-driven search would fill the back button with noise.
 */
export function writeSearchToUrl(filters: SearchFilters, lists: NameLists = {}): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const query = filtersToQuery(filters, lists);
  const url = window.location.pathname + (query ? `?${query}` : '') + window.location.hash;
  try {
    window.history.replaceState(window.history.state, '', url);
  } catch {
    /* cross-origin or sandboxed frame: leave the URL alone */
  }
}
