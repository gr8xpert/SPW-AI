export interface SearchFilters {
  query?: string;
  listingType?: string;
  locationId?: number;
  locationIds?: number[];
  propertyTypeId?: number;
  propertyTypeIds?: number[];
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minBuildSize?: number;
  maxBuildSize?: number;
  minPlotSize?: number;
  maxPlotSize?: number;
  minTerraceSize?: number;
  maxTerraceSize?: number;
  features?: number[];
  isFeatured?: boolean;
  // The agency's own listings rather than ones shared from a feed.
  isOwnProperty?: boolean;
  reference?: string;
  // A hand-picked list of references (data-spm-ref="R1,R2,R3"), in that order.
  references?: string[];
  sortBy?: SortOption;
  page?: number;
  limit?: number;
  bounds?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}

export type SortOption =
  | 'create_date_desc'
  | 'create_date'
  | 'write_date_desc'
  | 'write_date'
  | 'list_price'
  | 'list_price_desc'
  | 'is_featured_desc'
  | 'own_first'
  | 'location_id';

export interface LockedFilters {
  locationId?: number;
  listingType?: string;
  propertyTypeId?: number;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  features?: number[];
}

export interface PrefilledFilters extends SearchFilters {}
