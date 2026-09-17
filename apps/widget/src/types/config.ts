export interface WidgetConfig {
  apiUrl: string;
  apiKey: string;
  tenantSlug?: string;
  companyName?: string;
  dataPath?: string;
  cdnUrl?: string;
  syncVersion?: number;

  language?: string;
  currency?: string;
  theme?: 'light' | 'dark' | 'auto';
  primaryColor?: string;

  resultsPerPage?: number;
  searchTemplateId?: number;
  listingTemplateId?: number;
  defaultMapTemplate?: number;

  enableFavorites?: boolean;
  wishlistIcon?: 'heart' | 'star' | 'bookmark' | 'save';
  mapVariation?: 'auto' | '0' | '1' | '2';
  recaptchaSiteKey?: string;
  enableInquiry?: boolean;
  enableTracking?: boolean;
  enableAiChat?: boolean;
  enableMortgageCalculator?: boolean;
  mapSearchEnabled?: boolean;
  enableMapView?: boolean;
  similarProperties?: boolean;
  similarPropertiesLimit?: number;

  propertyPageSlug?: string;
  propertyPageUrl?: string;
  propertyRefPosition?: 'start' | 'end';
  resultsPage?: string;
  wishlistPage?: string;

  // Pre-built lookup bundle for this page's language (the WordPress plugin
  // writes uploads/spw-data/bundle-<lang>.json): locations, types, features
  // and labels in one cacheable file instead of four API calls.
  dataBundleUrl?: string;

  locationSearchConfig?: {
    dropdown1: { levels: string[]; visible?: boolean };
    dropdown2: { levels: string[]; visible?: boolean };
    dropdown3: { levels: string[]; visible?: boolean };
  };

  bedroomOptions?: number[];
  bathroomOptions?: number[];
  priceOptions?: Record<string, number[]>;
  defaultListingType?: string;
  enabledListingTypes?: string[];
  enabledSortOptions?: string[];
  radiusOptions?: number[];
  geocodingProvider?: 'nominatim' | 'google';
  googleMapsKey?: string;
  quickFeatureIds?: number[];

  // When true, the widget displays `property.agentReference` (MLSC-style
  // client-agency number) instead of `property.reference` on cards and the
  // detail page. Falls back to `reference` if `agentReference` is empty. Does
  // NOT affect URL slugs or API lookups — those always use `reference`.
  useAgentReferenceAsDisplay?: boolean;

  syncPollIntervalMs?: number;

  onPropertyClick?: (property: unknown) => void;
  onSearch?: (filters: unknown, results: unknown) => void;
  onInquiry?: (data: unknown) => void;
  customLabels?: Record<string, Record<string, string>>;
  customStyles?: Record<string, string>;
}

export interface RealtySoftConfig {
  apiUrl?: string;
  apiKey?: string;
  language?: string;
  currency?: string;
  theme?: string;
  resultsPerPage?: number;
  propertyPageSlug?: string;
  propertyPageUrl?: string;
  propertyRefPosition?: 'start' | 'end';
  defaultListingType?: string;
  enabledListingTypes?: string[];
  resultsPage?: string;
  wishlistPage?: string;
  dataBundleUrl?: string;
  searchTemplate?: number;
  listingTemplate?: number;
  mapTemplate?: number;
  primaryColor?: string;
  enableChat?: boolean;
  enableFavorites?: boolean;
  useAgentReferenceAsDisplay?: boolean;
  labels?: Record<string, Record<string, string>>;
  styles?: Record<string, string>;
  onReady?: () => void;
  onSearch?: (filters: unknown, results: unknown) => void;
  onPropertyClick?: (property: unknown) => void;
}

export interface ThemeVars {
  '--rs-primary': string;
  '--rs-primary-hover': string;
  '--rs-primary-light': string;
  '--rs-text': string;
  '--rs-text-light': string;
  '--rs-bg': string;
  '--rs-bg-secondary': string;
  '--rs-border': string;
  '--rs-radius': string;
  '--rs-shadow': string;
  '--rs-font': string;
  [key: string]: string;
}
