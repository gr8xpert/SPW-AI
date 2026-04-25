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
  enableInquiry?: boolean;
  enableTracking?: boolean;
  enableAiChat?: boolean;
  enableMortgageCalculator?: boolean;
  mapSearchEnabled?: boolean;
  similarProperties?: boolean;

  propertyPageSlug?: string;
  propertyPageUrl?: string;
  resultsPage?: string;

  radiusOptions?: number[];
  geocodingProvider?: 'nominatim' | 'google';
  googleMapsKey?: string;
  quickFeatureIds?: number[];

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
  resultsPage?: string;
  searchTemplate?: number;
  listingTemplate?: number;
  mapTemplate?: number;
  enableChat?: boolean;
  enableFavorites?: boolean;
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
