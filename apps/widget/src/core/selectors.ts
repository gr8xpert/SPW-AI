import type { SPMState, SearchFilters, LockedFilters } from '@/types';

export const selectors = {
  getConfig: (s: SPMState) => s.config,
  getFilters: (s: SPMState) => s.filters,
  getLockedFilters: (s: SPMState) => s.lockedFilters,
  getResults: (s: SPMState) => s.results,
  getSelectedProperty: (s: SPMState) => s.selectedProperty,
  getFavorites: (s: SPMState) => s.favorites,
  getLabels: (s: SPMState) => s.labels,
  getLocations: (s: SPMState) => s.locations,
  getPropertyTypes: (s: SPMState) => s.propertyTypes,
  getFeatures: (s: SPMState) => s.features,
  getCurrency: (s: SPMState) => s.currency,
  getUI: (s: SPMState) => s.ui,
  getSyncVersion: (s: SPMState) => s.syncVersion,

  isLoading: (s: SPMState) => s.ui.loading,
  isSearchLoading: (s: SPMState) => s.ui.searchLoading,
  isInitialized: (s: SPMState) => s.ui.initialized,
  getError: (s: SPMState) => s.ui.error,

  isFavorite: (s: SPMState, id: number) => s.favorites.includes(id),
  getFavoriteCount: (s: SPMState) => s.favorites.length,

  getEffectiveFilters: (s: SPMState): SearchFilters => ({
    ...s.filters,
    ...flattenLocked(s.lockedFilters),
  }),

  getResultCount: (s: SPMState) => s.results?.meta.total ?? 0,
  getCurrentPage: (s: SPMState) => s.results?.meta.page ?? 1,
  getTotalPages: (s: SPMState) => s.results?.meta.pages ?? 1,

  getLabel: (s: SPMState, key: string, fallback?: string): string => {
    return (s.labels as Record<string, string>)[key] ?? fallback ?? key;
  },
};

function flattenLocked(locked: LockedFilters): Partial<SearchFilters> {
  const out: Partial<SearchFilters> = {};
  if (locked.locationId != null) out.locationId = locked.locationId;
  if (locked.listingType != null) out.listingType = locked.listingType;
  if (locked.propertyTypeId != null) out.propertyTypeId = locked.propertyTypeId;
  if (locked.minPrice != null) out.minPrice = locked.minPrice;
  if (locked.maxPrice != null) out.maxPrice = locked.maxPrice;
  if (locked.minBedrooms != null) out.minBedrooms = locked.minBedrooms;
  if (locked.maxBedrooms != null) out.maxBedrooms = locked.maxBedrooms;
  if (locked.features?.length) {
    out.features = locked.features;
  }
  return out;
}
