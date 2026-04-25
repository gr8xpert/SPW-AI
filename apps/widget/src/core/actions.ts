import { store } from './store';
import type { SPWState, SearchFilters, LockedFilters, WidgetConfig } from '@/types';

export const actions = {
  setConfig: (config: WidgetConfig) => store.dispatch('SET_CONFIG', config),
  setFilters: (filters: SearchFilters) => store.dispatch('SET_FILTERS', filters),
  mergeFilters: (filters: Partial<SearchFilters>) => store.dispatch('MERGE_FILTERS', filters),
  resetFilters: () => store.dispatch('RESET_FILTERS'),
  setLockedFilters: (filters: LockedFilters) => store.dispatch('SET_LOCKED_FILTERS', filters),
  setResults: (results: SPWState['results']) => store.dispatch('SET_RESULTS', results),
  setSelectedProperty: (property: SPWState['selectedProperty']) => store.dispatch('SET_SELECTED_PROPERTY', property),
  addFavorite: (id: number) => store.dispatch('ADD_FAVORITE', id),
  removeFavorite: (id: number) => store.dispatch('REMOVE_FAVORITE', id),
  setFavorites: (ids: number[]) => store.dispatch('SET_FAVORITES', ids),
  setLabels: (labels: SPWState['labels']) => store.dispatch('SET_LABELS', labels),
  setLocations: (locations: SPWState['locations']) => store.dispatch('SET_LOCATIONS', locations),
  setPropertyTypes: (types: SPWState['propertyTypes']) => store.dispatch('SET_PROPERTY_TYPES', types),
  setFeatures: (features: SPWState['features']) => store.dispatch('SET_FEATURES', features),
  setCurrency: (currency: string) => store.dispatch('SET_CURRENCY', currency),
  setCurrencyRates: (rates: Record<string, number>) => store.dispatch('SET_CURRENCY_RATES', rates),
  setUI: (ui: SPWState['ui']) => store.dispatch('SET_UI', ui),
  mergeUI: (ui: Partial<SPWState['ui']>) => store.dispatch('MERGE_UI', ui),
  setSyncVersion: (version: number) => store.dispatch('SET_SYNC_VERSION', version),
  hydrate: (partial: Partial<SPWState>) => store.dispatch('HYDRATE', partial),
  setLoading: (loading: boolean) => store.dispatch('MERGE_UI', { loading }),
  setSearchLoading: (loading: boolean) => store.dispatch('MERGE_UI', { searchLoading: loading }),
  setError: (error: string | null) => store.dispatch('MERGE_UI', { error }),
  setInitialized: () => store.dispatch('MERGE_UI', { initialized: true }),
};
