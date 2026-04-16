// Widget Configuration
export interface SPWConfig {
  apiUrl: string;
  apiKey: string;
  dataPath?: string; // Path to local JSON files (default: /spw-data/)
  container: string | HTMLElement;
  language?: string;
  currency?: string;
  theme?: 'light' | 'dark' | 'auto';
  layout?: 'grid' | 'list';
  resultsPerPage?: number;
  showFilters?: boolean;
  showSorting?: boolean;
  showPagination?: boolean;
  enableFavorites?: boolean;
  enableInquiry?: boolean;
  enableTracking?: boolean;
  onPropertyClick?: (property: Property) => void;
  onSearch?: (filters: SearchFilters, results: SearchResults) => void;
  onInquiry?: (data: InquiryData) => void;
  customLabels?: Partial<Labels>;
  customStyles?: Partial<ThemeStyles>;
}

// Property Types
export interface Property {
  id: number;
  reference: string;
  title: string;
  description: string;
  listingType: 'sale' | 'rent' | 'development';
  propertyType: PropertyType;
  location: Location;
  price: number;
  priceOnRequest: boolean;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  buildSize?: number;
  plotSize?: number;
  terraceSize?: number;
  images: PropertyImage[];
  features: Feature[];
  isFeatured: boolean;
  lat?: number;
  lng?: number;
  videoUrl?: string;
  virtualTourUrl?: string;
}

export interface PropertyImage {
  url: string;
  alt?: string;
  order: number;
}

export interface PropertyType {
  id: number;
  name: string;
  slug: string;
}

export interface Location {
  id: number;
  name: string;
  slug: string;
  level: 'country' | 'province' | 'municipality' | 'town' | 'area';
  parentId?: number;
  propertyCount?: number;
}

export interface Feature {
  id: number;
  name: string;
  category: string;
  icon?: string;
}

// Search Types
export interface SearchFilters {
  query?: string;
  listingType?: 'sale' | 'rent' | 'development';
  locationId?: number;
  propertyTypeId?: number;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  minBuildSize?: number;
  maxBuildSize?: number;
  features?: number[];
  isFeatured?: boolean;
  sortBy?: 'price_asc' | 'price_desc' | 'date_asc' | 'date_desc' | 'featured';
  page?: number;
  limit?: number;
}

export interface SearchResults {
  data: Property[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

// Inquiry Types
export interface InquiryData {
  propertyId?: number;
  propertyReference?: string;
  name: string;
  email: string;
  phone?: string;
  message: string;
  preferredContact?: 'email' | 'phone';
}

// Labels (i18n)
export interface Labels {
  [key: string]: string;
  // Search form
  'search.title': string;
  'search.location': string;
  'search.propertyType': string;
  'search.listingType': string;
  'search.priceRange': string;
  'search.bedrooms': string;
  'search.bathrooms': string;
  'search.features': string;
  'search.submit': string;
  'search.reset': string;
  'search.forSale': string;
  'search.forRent': string;
  'search.development': string;
  'search.anyLocation': string;
  'search.anyType': string;
  'search.minPrice': string;
  'search.maxPrice': string;
  'search.any': string;

  // Results
  'results.title': string;
  'results.showing': string;
  'results.of': string;
  'results.properties': string;
  'results.noResults': string;
  'results.sortBy': string;
  'results.priceAsc': string;
  'results.priceDesc': string;
  'results.dateAsc': string;
  'results.dateDesc': string;
  'results.featured': string;

  // Property card
  'property.bedrooms': string;
  'property.bathrooms': string;
  'property.buildSize': string;
  'property.plotSize': string;
  'property.viewDetails': string;
  'property.priceOnRequest': string;
  'property.featured': string;
  'property.addToFavorites': string;
  'property.removeFromFavorites': string;

  // Property detail
  'detail.description': string;
  'detail.features': string;
  'detail.location': string;
  'detail.contact': string;
  'detail.similarProperties': string;
  'detail.virtualTour': string;
  'detail.video': string;

  // Inquiry form
  'inquiry.title': string;
  'inquiry.name': string;
  'inquiry.email': string;
  'inquiry.phone': string;
  'inquiry.message': string;
  'inquiry.submit': string;
  'inquiry.success': string;
  'inquiry.error': string;

  // Pagination
  'pagination.previous': string;
  'pagination.next': string;
  'pagination.page': string;

  // General
  'general.loading': string;
  'general.error': string;
  'general.close': string;
}

// Theme Styles
export interface ThemeStyles {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  borderRadius: string;
  fontFamily: string;
}

// Local Data Types (from JSON files)
export interface LocalData {
  locations: Location[];
  propertyTypes: PropertyType[];
  features: Feature[];
  labels: Labels;
  config: {
    defaultLanguage: string;
    availableLanguages: string[];
    currency: string;
    priceRanges: { min: number; max: number; label: string }[];
    bedroomOptions: number[];
  };
  syncVersion: number;
  lastSyncAt: string;
}

// Event Types
export interface SPWEvents {
  [key: string]: unknown;
  'ready': void;
  'search': { filters: SearchFilters; results: SearchResults };
  'property:click': Property;
  'property:view': Property;
  'inquiry:submit': InquiryData;
  'inquiry:success': InquiryData;
  'inquiry:error': { data: InquiryData; error: Error };
  'favorite:add': Property;
  'favorite:remove': Property;
  'error': Error;
}

// Tracking Types
export interface TrackingEvent {
  type: 'view' | 'search' | 'inquiry' | 'favorite';
  propertyId?: number;
  sessionId: string;
  filters?: SearchFilters;
  referrer?: string;
  timestamp: number;
}
