// Subscription status enum
export type SubscriptionStatus = 'active' | 'grace' | 'expired' | 'manual' | 'internal';
export type BillingCycle = 'monthly' | 'yearly';
export type BillingSource = 'manual' | 'stripe' | 'internal';
export type WishlistIcon = 'heart' | 'star' | 'bookmark' | 'save';

export type SlugFormat =
  | 'ref'
  | 'ref-title'
  | 'title-ref'
  | 'location-type-ref'
  | 'ref-type-location';

export const SLUG_FORMAT_OPTIONS: { value: SlugFormat; label: string; example: string }[] = [
  { value: 'ref', label: 'Reference Only', example: '/property/REF-1234' },
  { value: 'ref-title', label: 'Reference + Title', example: '/property/REF-1234-luxury-villa-marbella' },
  { value: 'title-ref', label: 'Title + Reference', example: '/property/luxury-villa-marbella-REF-1234' },
  { value: 'location-type-ref', label: 'Location + Type + Reference', example: '/property/marbella-villa-REF-1234' },
  { value: 'ref-type-location', label: 'Reference + Type + Location', example: '/property/REF-1234-villa-marbella' },
];

// Listing type configuration
export interface ListingTypeConfig {
  enabled: boolean;
  filterId: string;
  ownFilter: string;
  minPrice: number;
}

// Price range configuration
export interface PriceRangeConfig {
  min: number[];
  max: number[];
}

// Location search dropdown configuration (variation 2)
export interface LocationDropdownConfig {
  levels: string[];
  visible?: boolean;
}

export interface LocationSearchConfig {
  dropdown1: LocationDropdownConfig;
  dropdown2: LocationDropdownConfig;
  dropdown3: LocationDropdownConfig;
}

export const DEFAULT_LOCATION_SEARCH_CONFIG: LocationSearchConfig = {
  dropdown1: { levels: ['municipality'], visible: true },
  dropdown2: { levels: ['town'], visible: true },
  dropdown3: { levels: ['area'], visible: false },
};

// Extended TenantSettings interface with all V1 features
export interface TenantSettings {
  // Core settings
  theme: 'light' | 'dark';
  languages: string[];
  defaultLanguage: string;
  timezone: string;

  // Widget Config
  enableMapView?: boolean;
  enableCurrencyConverter?: boolean;
  baseCurrency?: string;
  availableCurrencies?: string[];

  // Branding
  companyName?: string;           // For emails/PDF (separate from tenant.name)
  websiteUrl?: string;
  logoUrl?: string;
  primaryColor?: string;
  emailHeaderColor?: string;

  // Customization
  wishlistIcon?: WishlistIcon;
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  extraConfigJson?: Record<string, any>;

  // Location Hierarchy
  locationParentType?: string;    // e.g., 'municipality'
  locationChildTypes?: string[];  // e.g., ['city', 'area']

  // Listing Types Config
  listingTypes?: {
    resales?: ListingTypeConfig;
    developments?: ListingTypeConfig;
    shortRentals?: ListingTypeConfig;
    longRentals?: ListingTypeConfig;
  };

  // Property Slug Format
  slugFormat?: SlugFormat;

  // Custom Price Ranges
  priceRanges?: {
    resale?: PriceRangeConfig;
    development?: PriceRangeConfig;
    longRental?: PriceRangeConfig;
    shortRental?: PriceRangeConfig;
  };

  // Location search config (variation 2 cascading dropdowns)
  locationSearchConfig?: LocationSearchConfig;

  // AI / OpenRouter
  openRouterApiKey?: string;
  openRouterModel?: string;

  // Search options (configurable ranges for bed/bath/price dropdowns)
  bedroomOptions?: number[];
  bathroomOptions?: number[];
  priceOptions?: Record<string, number[]>;
  enabledListingTypes?: string[];
  mapVariation?: 'auto' | '0' | '1' | '2';
  similarPropertiesLimit?: number;

  // Inquiry notifications
  inquiryNotificationEmails?: string[];  // Recipients for new inquiry alerts
  inquiryWebhookUrl?: string;            // POST new inquiries to this URL (Zapier/HubSpot/etc)
  inquiryAutoReplyEnabled?: boolean;     // Send confirmation email to the inquirer

  // AI Chat — master toggle
  aiChatEnabled?: boolean;

  // AI Chat — individual feature toggles
  aiChatNLSearch?: boolean;
  aiChatConversational?: boolean;
  aiChatPropertyQA?: boolean;
  aiChatComparison?: boolean;
  aiChatRecommendations?: boolean;
  aiChatMultilingual?: boolean;

  // AI Chat — configuration
  aiChatWelcomeMessage?: string;
  aiChatMaxMessagesPerConversation?: number;
  aiChatConversationTTLDays?: number;
  aiChatAutoEmailAdmin?: boolean;
}

export interface TenantPublic {
  id: number;
  name: string;
  slug: string;
  domain: string | null;
  settings: TenantSettings;
  isActive: boolean;
}

export interface TenantWithApiKey extends TenantPublic {
  // Hint only — last 4 chars of the raw key. The raw key itself is returned
  // exactly once at registration/rotation and then never retrievable from
  // the server (we only store sha256).
  apiKeyLast4: string;
  webhookUrl: string | null;
}

// Full tenant interface with all subscription fields
export interface TenantFull extends TenantWithApiKey {
  ownerEmail: string | null;
  siteName: string | null;
  apiUrl: string | null;

  // Subscription fields
  subscriptionStatus: SubscriptionStatus;
  billingCycle: BillingCycle | null;
  billingSource: BillingSource | null;
  expiresAt: Date | null;
  graceEndsAt: Date | null;
  adminOverride: boolean;
  isInternal: boolean;

  // Widget toggles
  widgetEnabled: boolean;
  aiSearchEnabled: boolean;
  // Super-admin: download feed images to R2 with dedup. Default false.
  feedImagesToR2: boolean;
  widgetFeatures: string[];

  // Super-admin add-on flags
  featureFlags: TenantFeatureFlags;

  planId: number;

  // Set whenever a tenant admin or super-admin clicks "Clear widget
  // cache". null on tenants that have never had one (or on rows that
  // predate the 5P migration).
  lastCacheClearedAt: Date | null;
}

export const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  theme: 'light',
  languages: ['en'],
  defaultLanguage: 'en',
  timezone: 'UTC',
  enableMapView: true,
  enableCurrencyConverter: false,
  baseCurrency: 'EUR',
  availableCurrencies: ['EUR', 'GBP', 'USD'],
  wishlistIcon: 'heart',
  listingTypes: {
    resales: { enabled: true, filterId: '', ownFilter: '', minPrice: 0 },
    developments: { enabled: false, filterId: '', ownFilter: '', minPrice: 0 },
    shortRentals: { enabled: false, filterId: '', ownFilter: '', minPrice: 0 },
    longRentals: { enabled: false, filterId: '', ownFilter: '', minPrice: 0 },
  },
};

// Feature flags — super-admin-controlled add-ons per tenant.
// Layer 1 (what client paid for). Layer 2 is TenantSettings (what client configured).
// Effective = featureFlags[x] AND settings[x].
export interface TenantFeatureFlags {
  mapSearch: boolean;
  mapView: boolean;
  aiSearch: boolean;
  aiChatbot: boolean;
  mortgageCalculator: boolean;
  currencyConverter: boolean;
}

export const DEFAULT_FEATURE_FLAGS: TenantFeatureFlags = {
  mapSearch: false,
  mapView: false,
  aiSearch: false,
  aiChatbot: false,
  mortgageCalculator: false,
  currencyConverter: false,
};

export const ALL_ENABLED_FEATURE_FLAGS: TenantFeatureFlags = {
  mapSearch: true,
  mapView: true,
  aiSearch: true,
  aiChatbot: true,
  mortgageCalculator: true,
  currencyConverter: true,
};

// Currency options supported by the widget
export const SUPPORTED_CURRENCIES = [
  'EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'RUB', 'AED', 'CNY'
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

// OpenRouter model options for the AI settings dropdown
export const OPENROUTER_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (Fast & Cheap)' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
];
