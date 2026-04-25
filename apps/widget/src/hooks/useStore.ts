import { useSyncExternalStore } from 'preact/compat';
import { useRef } from 'preact/hooks';
import { store } from '@/core/store';
import type { SPWState, StateSlice } from '@/types';

const subscribe = store.subscribe.bind(store);

export function useStore(): SPWState {
  return useSyncExternalStore(subscribe, store.getSnapshot);
}

export function useStoreSlice<K extends StateSlice>(slice: K): SPWState[K] {
  return useSyncExternalStore(
    (cb) => store.subscribeSlice(slice, cb as () => void),
    () => store.get(slice),
  );
}

export function useSelector<T>(selector: (state: SPWState) => T): T {
  const cache = useRef<{ state: SPWState; value: T } | null>(null);

  return useSyncExternalStore(subscribe, () => {
    const state = store.getState();
    if (cache.current && cache.current.state === state) {
      return cache.current.value;
    }
    const value = selector(state);
    cache.current = { state, value };
    return value;
  });
}
