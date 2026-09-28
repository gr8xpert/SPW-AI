import { useEffect, useMemo, useState } from 'preact/hooks';
import { getDataLoader, type MapArea } from '@/core/data-loader';
import { selectors } from '@/core/selectors';
import { toCoord } from '@/core/map-support';
import { useSelector } from './useStore';
import type { SearchFilters } from '@/types';

export interface MapAreasState {
  areas: MapArea[];
  loading: boolean;
}

// One request per distinct filter set, shared by every component that wants it.
const inflight = new Map<string, Promise<{ data: MapArea[] }>>();

/**
 * The places the current search covers, with counts and outlines.
 *
 * Listings from a feed carry no coordinates of their own, so the map draws the
 * town and puts the count on it. 'all' ignores the filters, for the explore map.
 */
export function useMapAreas(scope: 'search' | 'all' = 'search'): MapAreasState {
  const effective = useSelector(selectors.getEffectiveFilters);
  const filters: SearchFilters = scope === 'all' ? {} : effective;
  // Paging, sort order and the area box narrow the list, not the map.
  const key = useMemo(() => {
    const { page, limit, sortBy, bounds, ...rest } = filters as SearchFilters & Record<string, unknown>;
    void page; void limit; void sortBy; void bounds;
    return JSON.stringify(rest, Object.keys(rest).sort());
  }, [filters]);

  const [state, setState] = useState<MapAreasState>({ areas: [], loading: true });

  useEffect(() => {
    const loader = getDataLoader();
    if (!loader) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    let promise = inflight.get(key);
    if (!promise) {
      promise = loader.getAreas(JSON.parse(key)).finally(() => inflight.delete(key));
      inflight.set(key, promise);
    }
    promise
      .then((res) => {
        if (cancelled) return;
        // Coordinates may arrive as decimal strings; drop anything unusable.
        const areas = (res?.data || [])
          .map((a) => ({ ...a, lat: toCoord(a.lat) as number, lng: toCoord(a.lng) as number }))
          .filter((a) => a.lat != null && a.lng != null);
        setState({ areas, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ areas: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}
