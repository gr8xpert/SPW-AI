import { store } from './store';
import { actions } from './actions';
import { selectors } from './selectors';
import type { SearchFilters } from '@/types';

declare global {
  interface Window {
    RealtySoft?: RealtySoftAPI;
  }
}

export interface RealtySoftAPI {
  State: {
    getState: () => unknown;
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
  };
  search: (filters?: SearchFilters) => void;
  reset: () => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  getFilters: () => SearchFilters;
  addFavorite: (id: number) => void;
  removeFavorite: (id: number) => void;
  getFavorites: () => number[];
  on: (event: string, callback: (...args: unknown[]) => void) => () => void;
}

let searchHandler: ((filters: SearchFilters) => void) | null = null;

export function setSearchHandler(handler: (filters: SearchFilters) => void): void {
  searchHandler = handler;
}

export function installLegacyAPI(): void {
  const api: RealtySoftAPI = {
    State: {
      getState: () => structuredClone(store.getState()),
      get: (key: string) => {
        const state = store.getState();
        const val = (state as unknown as Record<string, unknown>)[key];
        return typeof val === 'object' && val !== null ? structuredClone(val) : val;
      },
      set: (_key: string, _value: unknown) => {
        // Disabled — use setFilters() / addFavorite() / removeFavorite() instead
      },
    },

    search: (filters?: SearchFilters) => {
      if (filters) {
        actions.setFilters(filters);
      }
      searchHandler?.(selectors.getEffectiveFilters(store.getState()));
    },

    reset: () => {
      actions.resetFilters();
      searchHandler?.(selectors.getEffectiveFilters(store.getState()));
    },

    setFilters: (filters: Partial<SearchFilters>) => {
      actions.mergeFilters(filters);
    },

    getFilters: () => selectors.getFilters(store.getState()),

    addFavorite: (id: number) => actions.addFavorite(id),
    removeFavorite: (id: number) => actions.removeFavorite(id),
    getFavorites: () => selectors.getFavorites(store.getState()),

    on: (_event: string, callback: (...args: unknown[]) => void) => {
      return store.subscribe(() => {
        callback(store.getState());
      });
    },
  };

  window.RealtySoft = api;
}
