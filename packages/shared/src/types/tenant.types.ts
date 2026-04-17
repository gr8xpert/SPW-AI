// Subscription status enum
export type SubscriptionStatus = 'active' | 'grace' | 'expired' | 'manual' | 'internal';
export type BillingCycle = 'monthly' | 'yearly';
export type BillingSource = 'manual' | 'paddle' | 'internal';
export type WishlistIcon = 'heart' | 'star' | 'bookmark' | 'save';

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

  // Custom Price Ranges
  priceRanges?: {
    resale?: PriceRangeConfig;
    development?: PriceRangeConfig;
    longRental?: PriceRangeConfig;
    shortRental?: PriceRangeConfig;
  };
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
  widgetFeatures: string[];

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

// Currency options supported by the widget
export const SUPPORTED_CURRENCIES = [
  'EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK',
  'PLN', 'CZK', 'HUF', 'RUB', 'AED', 'CNY'
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];
