import { useEffect, useMemo, useState } from 'preact/hooks';
import { getDataLoader, type MapPoint } from '@/core/data-loader';
import { selectors } from '@/core/selectors';
import { toCoord } from '@/core/map-support';
import { useSelector } from './useStore';
import type { SearchFilters } from '@/types';

export interface MapPointsState {
  points: MapPoint[];
  loading: boolean;
  error: boolean;
  truncated: boolean;
  // Changes whenever a new set of points arrives; the map re-fits on it.
  version: string;
}

// One request per distinct filter set, shared by every map component on the
// page (the map and its location chips render together).
const inflight = new Map<string, Promise<{ data: MapPoint[]; meta: { truncated: boolean } }>>();

// Every listing matching the current search ('search'), or every listing of
// the site ('all', for the explore map), as map points.
export function useMapPoints(scope: 'search' | 'all' = 'search'): MapPointsState {
  const effective = useSelector(selectors.getEffectiveFilters);
  const filters: SearchFilters = scope === 'all' ? {} : effective;
  // The area box, paging and sort order narrow the list, not the map.
  const key = useMemo(() => {
    const { page, limit, sortBy, bounds, ...rest } = filters as SearchFilters & Record<string, unknown>;
    void page; void limit; void sortBy; void bounds;
    return JSON.stringify(rest, Object.keys(rest).sort());
  }, [filters]);

  const [state, setState] = useState<MapPointsState>({ points: [], loading: true, error: false, truncated: false, version: '' });

  useEffect(() => {
    const loader = getDataLoader();
    if (!loader) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    let promise = inflight.get(key);
    if (!promise) {
      promise = loader.getMapPoints(JSON.parse(key)).finally(() => inflight.delete(key));
      inflight.set(key, promise);
    }
    promise
      .then((res) => {
        if (cancelled) return;
        // Coordinates may arrive as decimal strings; drop anything unusable.
        const points = (res?.data || [])
          .map((p) => ({ ...p, lat: toCoord(p.lat) as number, lng: toCoord(p.lng) as number }))
          .filter((p) => p.lat != null && p.lng != null);
        setState({ points, loading: false, error: false, truncated: !!res?.meta?.truncated, version: key });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return state;
}
