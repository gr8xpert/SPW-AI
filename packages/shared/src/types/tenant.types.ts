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

  /**
   * Canonical Area → Province overrides for feed import, keyed by area slug.
   *
   *   { "costa-del-sol": "Málaga" }
   *
   * Feeds describe a property's hierarchy per-row, and Resales sends no ID for
   * Province/Area/SubLocation — only names. So one property carrying
   * `Province: "Cádiz", Area: "Costa del Sol"` is enough to create a second
   * "Costa del Sol" node under Cádiz, alongside the real one under Málaga.
   * The result is duplicate entries in the tree and in widget dropdowns.
   *
   * An entry here rewrites the province for that area before the chain is
   * built, so the area always lands under one canonical parent no matter what
   * an individual property claims.
   *
   * This is the PER-TENANT layer, applied on top of {@link DEFAULT_AREA_PROVINCE}
   * — most clients need nothing here. Use it to add an area the platform map
   * doesn't cover, or to correct one for a tenant whose feed is unusual.
   * Mapping an area to an empty string opts that tenant out of a platform
   * default, restoring the raw feed behaviour.
   *
   * Value is the province *name* (not slug) so the province node can be created
   * with correct display text and accents if it doesn't exist yet.
   */
  locationAreaProvince?: Record<string, string>;

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

  // Brochure / PDF
  contactEmail?: string;          // Shown in branded PDF header/footer
  contactPhone?: string;          // Shown in branded PDF header/footer
  defaultBrochureVariant?: 'branded' | 'unbranded'; // Default for properties with brochureVariant='inherit'

  // Customization
  wishlistIcon?: WishlistIcon;
  recaptchaSiteKey?: string;
  /**
   * @deprecated Moved to encrypted `tenants.recaptchaSecretKey` column. Not returned
   * by API responses. Reads still tolerate this field for legacy callers, but
   * new code should use the dedicated column.
   */
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
  /**
   * @deprecated Moved to encrypted `tenants.openrouterApiKey` column. Not returned
   * by API responses.
   */
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
  /**
   * @deprecated Moved to validated `tenants.inquiryWebhookUrl` column with SSRF
   * pre-flight on save. Not returned by API responses.
   */
  inquiryWebhookUrl?: string;
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
  // Dashboard add-on flags (per-client). Locked features grey out
  // their entry points and gate page content.
  dashboardAddons: DashboardAddons;
  // 3-tier commercial plan. Drives sidebar visibility on the client side:
  // Tier 1 hides all property-related navigation entirely, Tier 2 shows
  // property module, Tier 3 unlocks premium add-ons. Super-admin bypasses
  // this filter regardless of the tenant's tier.
  tier: TenantTier;
  // "Configured" booleans for secrets stored in dedicated encrypted columns.
  // The dashboard renders a "Configured" indicator from these — the raw values
  // are never returned by the API.
  recaptchaSecretKeyConfigured: boolean;
  openRouterApiKeyConfigured: boolean;
  inquiryWebhookUrlConfigured: boolean;
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
  dashboardAddons: DashboardAddons;

  planId: number;

  // 3-tier commercial plan. Drives dashboard add-on defaults; super-admin
  // can override individual add-ons above the preset after setting a tier.
  tier: TenantTier;

  // Optional linkage to a Xero Contact record. Set by super-admin so the
  // n8n Xero-sync workflow can attach invoices to the correct contact.
  xeroContactId: string | null;

  // Set whenever a tenant admin or super-admin clicks "Clear widget
  // cache". null on tenants that have never had one (or on rows that
  // predate the 5P migration).
  lastCacheClearedAt: Date | null;
}

/**
 * Canonical Area → Province mapping applied to every tenant's feed import.
 *
 * Feeds describe a property's hierarchy per row, and Resales sends no ID for
 * Province/Area — only names. A single property carrying
 * `Province: "Cádiz", Area: "Costa del Sol"` therefore creates a second
 * "Costa del Sol" node under Cádiz next to the real one under Málaga, which
 * then appears twice in the Locations tree and in widget dropdowns. Every
 * Spanish client on a Resales-style feed hits this, so it ships as a platform
 * default rather than per-tenant configuration.
 *
 * Keys are area slugs; values are province display names (used to create the
 * province node with correct accents if it doesn't exist yet).
 *
 * ONLY include areas that belong to exactly ONE province. Several well-known
 * Spanish costas span two or more, and forcing them into one would file real
 * properties in the wrong province — those are deliberately absent:
 *   - Costa de la Luz    → spans Huelva AND Cádiz
 *   - Costa Vasca        → spans Vizcaya AND Guipúzcoa
 *   - Rías Altas         → spans A Coruña AND Lugo
 * Leaving them out means they keep whatever province the feed supplied, which
 * is the safe behaviour.
 *
 * A tenant can override any entry — or opt out of one by mapping it to an
 * empty string — via `TenantSettings.locationAreaProvince`.
 */
export const DEFAULT_AREA_PROVINCE: Record<string, string> = {
  // Andalucía
  'costa-del-sol': 'Málaga',
  'costa-del-sol-east': 'Málaga',
  'costa-del-sol-west': 'Málaga',
  'costa-tropical': 'Granada',
  'costa-de-almeria': 'Almería',
  'costa-almeria': 'Almería',
  // Levante
  'costa-blanca': 'Alicante',
  'costa-blanca-north': 'Alicante',
  'costa-blanca-south': 'Alicante',
  'costa-calida': 'Murcia',
  'costa-azahar': 'Castellón',
  'costa-del-azahar': 'Castellón',
  'costa-valencia': 'Valencia',
  // Cataluña
  'costa-brava': 'Girona',
  'costa-dorada': 'Tarragona',
  'costa-daurada': 'Tarragona',
  'costa-maresme': 'Barcelona',
  'costa-barcelona': 'Barcelona',
  'costa-garraf': 'Barcelona',
  // Norte
  'costa-verde': 'Asturias',
  'costa-da-morte': 'A Coruña',
  'rias-baixas': 'Pontevedra',
  'costa-cantabra': 'Cantabria',
};

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

// Dashboard-side add-ons sold per-client. Super-admin toggles each
// individually from the Clients page. Locked features render greyed in
// the dashboard with an upgrade prompt; unlocked ones behave normally.
//
// These are distinct from TenantFeatureFlags (which gate widget-side
// behavior). DashboardAddons gate dashboard pages and admin actions.
export interface DashboardAddons {
  addProperty: boolean;     // Properties → Add property
  emailCampaign: boolean;   // /dashboard/campaigns
  feedExport: boolean;      // /dashboard/feed-export
  team: boolean;            // /dashboard/team
  aiChat: boolean;          // /dashboard/ai-chat
  aiTranslation: boolean;   // AI Translate + AI SEO across properties, features, labels, property-types
}

export const DEFAULT_DASHBOARD_ADDONS: DashboardAddons = {
  addProperty: false,
  emailCampaign: false,
  feedExport: false,
  team: false,
  aiChat: false,
  aiTranslation: false,
};

export const ALL_ENABLED_DASHBOARD_ADDONS: DashboardAddons = {
  addProperty: true,
  emailCampaign: true,
  feedExport: true,
  team: true,
  aiChat: true,
  aiTranslation: true,
};

// Tenant tier. Drives a preset DashboardAddons bundle:
//   1 = support only (all add-ons locked)
//   2 = support + property management (basic add-ons unlocked, premium AI still locked)
//   3 = support + everything (all add-ons unlocked)
// Super-admin can still override individual add-ons above/below the preset
// after setting the tier (e.g. Tier 2 tenant with aiChat manually enabled).
export type TenantTier = 1 | 2 | 3;

export const TIER_PRESETS: Record<TenantTier, DashboardAddons> = {
  1: {
    addProperty: false,
    emailCampaign: false,
    feedExport: false,
    team: false,
    aiChat: false,
    aiTranslation: false,
  },
  2: {
    addProperty: true,
    emailCampaign: false,
    feedExport: true,
    team: true,
    aiChat: false,
    aiTranslation: false,
  },
  3: {
    addProperty: true,
    emailCampaign: true,
    feedExport: true,
    team: true,
    aiChat: true,
    aiTranslation: true,
  },
};

export const TIER_LABELS: Record<TenantTier, string> = {
  1: 'Tier 1 — Support only',
  2: 'Tier 2 — Support + Property management',
  3: 'Tier 3 — Everything (all premium add-ons)',
};

export const DEFAULT_TENANT_TIER: TenantTier = 1;

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
