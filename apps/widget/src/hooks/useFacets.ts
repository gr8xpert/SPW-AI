import { useEffect, useRef, useState } from 'preact/hooks';
import { getDataLoader, type Facets } from '@/core/data-loader';
import { selectors } from '@/core/selectors';
import { useSelector } from './useStore';
import type { SearchFilters } from '@/types';

// The counts beside the type and location choices, following the search as the
// visitor builds it (like the Search button's count): with Mijas picked, the
// type list says how many of each type Mijas has. Null until the first answer,
// so the lists fall back to the site-wide counts they came with.
const DEBOUNCE_MS = 350;

// One request per set of filters, however many dropdowns ask.
const inflight = new Map<string, Promise<Facets | null>>();
let lastFacets: Facets | null = null;

function facetsFor(key: string): Promise<Facets | null> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const loader = getDataLoader();
  if (!loader) return Promise.resolve(null);
  const promise = loader
    .getFacets(JSON.parse(key) as SearchFilters)
    .then((res) => (res && typeof res === 'object' && 'types' in res ? res : null))
    .catch(() => null)
    .finally(() => { inflight.delete(key); });
  inflight.set(key, promise);
  return promise;
}

export function useFacets(): Facets | null {
  const filters = useSelector(selectors.getEffectiveFilters);
  const [facets, setFacets] = useState<Facets | null>(lastFacets);
  const latest = useRef(0);

  const { page, limit, sortBy, bounds, ...rest } = filters as SearchFilters;
  void page; void limit; void sortBy; void bounds;
  const key = JSON.stringify(rest);

  useEffect(() => {
    if (!getDataLoader()) return;
    const run = ++latest.current;
    const timer = setTimeout(() => {
      // A slower earlier answer must not overwrite a newer one.
      facetsFor(key).then((res) => {
        if (run !== latest.current || !res) return;
        lastFacets = res;
        setFacets(res);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key]);

  return facets;
}

// The number to show beside a choice: the live count once known (0 hides it),
// otherwise the count the list arrived with.
export function facetCount(facets: Facets | null, dimension: 'types' | 'locations', id: number, fallback?: number): number {
  if (!facets) return fallback ?? 0;
  return facets[dimension][id] ?? 0;
}
