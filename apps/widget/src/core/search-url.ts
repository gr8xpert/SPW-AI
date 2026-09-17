import type { SearchFilters } from '@/types';

// Search filters <-> URL query string. Lets a search box on one page (e.g. the
// homepage) send the visitor to the results page with the search applied, and
// makes a results page shareable. Only filters a visitor sets are carried;
// paging and map viewport are page-local.
const NUMBER_KEYS = [
  'locationId', 'propertyTypeId', 'minPrice', 'maxPrice',
  'minBedrooms', 'maxBedrooms', 'minBathrooms', 'maxBathrooms',
  'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize',
  'minTerraceSize', 'maxTerraceSize',
] as const;
const LIST_KEYS = ['locationIds', 'propertyTypeIds', 'features'] as const;
const STRING_KEYS = ['query', 'listingType', 'reference', 'sortBy'] as const;

export function filtersToQuery(filters: SearchFilters): string {
  const params = new URLSearchParams();
  const f = filters as Record<string, unknown>;
  for (const key of [...STRING_KEYS, ...NUMBER_KEYS]) {
    const v = f[key];
    if (v !== undefined && v !== null && v !== '') params.set(key, String(v));
  }
  for (const key of LIST_KEYS) {
    const v = f[key];
    if (Array.isArray(v) && v.length) params.set(key, v.join(','));
  }
  if (filters.isFeatured) params.set('isFeatured', 'true');
  return params.toString();
}

export function filtersFromQuery(search: string = window.location.search): SearchFilters {
  const params = new URLSearchParams(search);
  const out: Record<string, unknown> = {};
  for (const key of STRING_KEYS) {
    const v = params.get(key);
    if (v) out[key] = v;
  }
  for (const key of NUMBER_KEYS) {
    const v = params.get(key);
    if (v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[key] = n;
  }
  for (const key of LIST_KEYS) {
    const v = params.get(key);
    if (!v) continue;
    const list = v.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (list.length) out[key] = list;
  }
  if (params.get('isFeatured') === 'true') out.isFeatured = true;
  return out as SearchFilters;
}
