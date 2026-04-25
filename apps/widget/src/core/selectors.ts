import type { SPWState, SearchFilters, LockedFilters } from '@/types';

export const selectors = {
  getConfig: (s: SPWState) => s.config,
  getFilters: (s: SPWState) => s.filters,
  getLockedFilters: (s: SPWState) => s.lockedFilters,
  getResults: (s: SPWState) => s.results,
  getSelectedProperty: (s: SPWState) => s.selectedProperty,
  getFavorites: (s: SPWState) => s.favorites,
  getLabels: (s: SPWState) => s.labels,
  getLocations: (s: SPWState) => s.locations,
  getPropertyTypes: (s: SPWState) => s.propertyTypes,
  getFeatures: (s: SPWState) => s.features,
  getCurrency: (s: SPWState) => s.currency,
  getUI: (s: SPWState) => s.ui,
  getSyncVersion: (s: SPWState) => s.syncVersion,

  isLoading: (s: SPWState) => s.ui.loading,
  isSearchLoading: (s: SPWState) => s.ui.searchLoading,
  isInitialized: (s: SPWState) => s.ui.initialized,
  getError: (s: SPWState) => s.ui.error,

  isFavorite: (s: SPWState, id: number) => s.favorites.includes(id),
  getFavoriteCount: (s: SPWState) => s.favorites.length,

  getEffectiveFilters: (s: SPWState): SearchFilters => ({
    ...s.filters,
    ...flattenLocked(s.lockedFilters),
  }),

  getResultCount: (s: SPWState) => s.results?.meta.total ?? 0,
  getCurrentPage: (s: SPWState) => s.results?.meta.page ?? 1,
  getTotalPages: (s: SPWState) => s.results?.meta.pages ?? 1,

  getLabel: (s: SPWState, key: string, fallback?: string): string => {
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
