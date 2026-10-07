import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getDataLoader, type Facets } from '@/core/data-loader';
import { selectors } from '@/core/selectors';
import { useSelector } from './useStore';
import type { SearchFilters, WidgetConfig } from '@/types';
import { useConfig } from './useConfig';

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

// The number to show beside a choice: the live count once known — 0 included,
// so a narrowed search shows which choices would find nothing (10-06) —
// otherwise the count the list arrived with. Undefined = nothing to show yet.
export function facetCount(facets: Facets | null, dimension: 'types' | 'locations', id: number, fallback?: number): number | undefined {
  if (!facets) return fallback && fallback > 0 ? fallback : undefined;
  return facets[dimension][id] ?? 0;
}

/** Class for a count badge: zero is drawn fainter. */
export function countClass(base: string, count: number | undefined): string {
  return count === 0 ? `${base} ${base}--zero` : base;
}

// ── Hiding choices that would find nothing ───────────────────────────────
// Once live counts are in, a location / type / status / feature with 0 listings for the
// search on screen drops out of the lists (Settings → Widget → "Hide search
// options with no listings", on unless set off). Kept regardless: what the
// visitor already picked (so it can be unticked) and the parents of anything
// kept (a tree never loses its branch). Before the first counts arrive
// nothing is hidden, so the lists don't flicker.

/** True when zero-count choices should be hidden right now. */
export function hidesEmpty(config: Pick<WidgetConfig, 'hideEmptySearchOptions'>, facets: Facets | null): boolean {
  return !!facets && config.hideEmptySearchOptions !== false;
}

export function withoutEmpty<T extends { id: number; parentId?: number | null }>(
  items: T[],
  counts: Record<number, number> | undefined,
  keep: Iterable<number | null | undefined>,
): T[] {
  if (!counts) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const kept = new Set<number>();
  const add = (id: number | null | undefined) => {
    let cur = id != null ? byId.get(id) : undefined;
    while (cur && !kept.has(cur.id)) {
      kept.add(cur.id);
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
  };
  for (const id of keep) add(id);
  for (const item of items) if ((counts[item.id] ?? 0) > 0) add(item.id);
  return items.filter((i) => kept.has(i.id));
}

/** The list a dropdown shows: `items` minus the choices that find nothing. */
export function useNonEmpty<T extends { id: number; parentId?: number | null }>(
  items: T[],
  dimension: 'types' | 'locations' | 'features',
  keep: Array<number | null | undefined>,
): T[] {
  const facets = useFacets();
  const config = useConfig();
  const active = hidesEmpty(config, facets);
  const keepKey = keep.join(',');
  return useMemo(
    () => (active ? withoutEmpty(items, facets![dimension], keep) : items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, items, facets, dimension, keepKey],
  );
}
