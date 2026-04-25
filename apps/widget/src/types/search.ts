export interface SearchFilters {
  query?: string;
  listingType?: string;
  locationId?: number;
  propertyTypeId?: number;
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
  features?: number[];
  isFeatured?: boolean;
  reference?: string;
  sortBy?: SortOption;
  page?: number;
  limit?: number;
  bounds?: string;
  lat?: number;
  lng?: number;
  radius?: number;
}

export type SortOption =
  | 'price_asc'
  | 'price_desc'
  | 'date_asc'
  | 'date_desc'
  | 'featured';

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
