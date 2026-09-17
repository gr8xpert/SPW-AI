import { useEffect, useState } from 'preact/hooks';
import { getDataLoader } from '@/core/data-loader';
import { selectors } from '@/core/selectors';
import { useFavorites } from './useFavorites';
import { useSelector } from './useStore';
import type { Property } from '@/types';

// Saved properties are loaded by id. Filtering them out of the current search
// results (the old approach) only ever found the saved properties that
// happened to be on the one page of results in memory, so a wishlist page
// silently dropped the rest.
//
// Shared module-level cache: the grid, the actions bar and the compare modal
// all render at once and must not each fire the same request.
let cache: { ids: Set<number>; properties: Property[] } | null = null;
let inflight: { key: string; promise: Promise<Property[]> } | null = null;

function keyOf(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(',');
}

function load(ids: number[]): Promise<Property[]> {
  // Removing a favourite never needs a round-trip: the smaller set is already
  // in the cache.
  if (cache && ids.every((id) => cache!.ids.has(id))) {
    return Promise.resolve(cache.properties.filter((p) => ids.includes(p.id)));
  }
  const key = keyOf(ids);
  if (inflight?.key === key) return inflight.promise;

  const loader = getDataLoader();
  if (!loader) return Promise.resolve([]);

  const promise = loader
    .getPropertiesByIds(ids)
    .then((properties) => {
      cache = { ids: new Set(ids), properties };
      return properties;
    })
    .finally(() => {
      if (inflight?.key === key) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

export function useWishlistProperties(): { properties: Property[]; loading: boolean } {
  const { favorites } = useFavorites();
  const results = useSelector(selectors.getResults);
  const key = keyOf(favorites);
  const [loaded, setLoaded] = useState<Property[] | null>(null);

  useEffect(() => {
    if (favorites.length === 0) {
      setLoaded([]);
      return;
    }
    let live = true;
    load(favorites)
      .then((properties) => { if (live) setLoaded(properties); })
      .catch(() => { if (live) setLoaded(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Until the lookup answers (or if it failed), show whatever saved properties
  // the current results already hold rather than an empty page.
  const source = loaded ?? results?.data ?? [];
  const byId = new Map(source.map((p) => [p.id, p] as const));
  // Keep the order the visitor saved them in.
  const properties = favorites
    .map((id) => byId.get(id))
    .filter((p): p is Property => p !== undefined);

  return { properties, loading: loaded === null && favorites.length > 0 };
}
