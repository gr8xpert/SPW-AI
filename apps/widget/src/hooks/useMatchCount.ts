import { useEffect, useRef, useState } from 'preact/hooks';
import { getDataLoader } from '@/core/data-loader';
import { selectors } from '@/core/selectors';
import { useSelector } from './useStore';
import type { SearchFilters } from '@/types';

// How many properties the filters on screen would find, updated as the visitor
// changes them — so the Search button can say "Search 42" before it is pressed
// rather than repeating the count of the last search.
//
// Paging, sorting and the page's own limit don't change the number of matches,
// so they are dropped: that keeps the key stable and lets the data loader's
// cache answer a filter the visitor goes back to.
const DEBOUNCE_MS = 350;

// One request per set of filters, however many blocks ask for the count: a
// page can hold several search boxes, and a re-render must not re-ask.
const inflight = new Map<string, Promise<number | null>>();

function countFor(key: string): Promise<number | null> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const loader = getDataLoader();
  if (!loader) return Promise.resolve(null);
  const promise = loader
    .searchProperties({ ...(JSON.parse(key) as SearchFilters), page: 1, limit: 1 })
    .then((res) => res?.meta?.total ?? null)
    .catch(() => null)
    .finally(() => { inflight.delete(key); });
  inflight.set(key, promise);
  return promise;
}

export function useMatchCount(): number | null {
  const filters = useSelector(selectors.getEffectiveFilters);
  const searched = useSelector(selectors.getResultCount);
  const [count, setCount] = useState<number | null>(null);
  const latest = useRef(0);

  const { page, limit, sortBy, bounds, ...rest } = filters as SearchFilters;
  void page; void limit; void sortBy; void bounds;
  const key = JSON.stringify(rest);

  useEffect(() => {
    const loader = getDataLoader();
    if (!loader) return;
    const run = ++latest.current;
    const timer = setTimeout(() => {
      // A slower earlier request must not overwrite a newer answer.
      countFor(key).then((total) => { if (run === latest.current) setCount(total); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key]);

  // Until the first count arrives, the last search's total is the honest
  // number to show — and nothing at all before any search has run.
  return count ?? (searched > 0 ? searched : null);
}
