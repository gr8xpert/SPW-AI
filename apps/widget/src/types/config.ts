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

  // AI search is offered only when the client switched it on and holds their
  // own OpenRouter key; /v1/ai-search/status confirms the key before the
  // button appears.
  aiSearchEnabled?: boolean;

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
  // Map background tiles (Settings → Widget → Map tiles). OpenStreetMap when unset.
  mapTiles?: { provider?: 'osm' | 'maptiler' | 'custom'; key?: string; url?: string; attribution?: string };
  // Dashboard Settings → Property URL format (see apps/api property-url.ts).
  slugFormat?: 'ref' | 'ref-title' | 'title-ref' | 'location-type-ref' | 'ref-type-location';
  // Templates chosen in the dashboard gallery; data-spm-widget="site-search"
  // (site-listing, site-detail, site-map) renders the chosen one.
  siteTemplates?: { search?: string; listing?: string; detail?: string; map?: string; wishlist?: string };
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
  // Brand colour the page already knows (the WordPress plugin caches the
  // dashboard's). Used for the first paint only; the dashboard value wins.
  brandColor?: string;
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
