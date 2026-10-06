import * as z from 'zod';

// Shared types, constants and form schemas for the Settings page tabs.

export type SlugFormat = 'ref' | 'ref-title' | 'title-ref' | 'location-type-ref' | 'ref-type-location';

export const SLUG_FORMAT_OPTIONS: { value: SlugFormat; label: string; example: string }[] = [
  // The reference is always set apart with "_" (references contain dashes).
  { value: 'ref', label: 'Reference Only', example: '/property/REF-1234' },
  { value: 'ref-title', label: 'Reference + Title', example: '/property/REF-1234_luxury-villa-marbella' },
  { value: 'title-ref', label: 'Title + Reference', example: '/property/luxury-villa-marbella_REF-1234' },
  { value: 'location-type-ref', label: 'Location + Type + Reference', example: '/property/marbella-villa_REF-1234' },
  { value: 'ref-type-location', label: 'Reference + Type + Location', example: '/property/REF-1234_villa-marbella' },
];

export const ALL_LANGUAGES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French', nl: 'Dutch',
  it: 'Italian', ru: 'Russian', sv: 'Swedish', no: 'Norwegian',
  da: 'Danish', pl: 'Polish', cs: 'Czech', fi: 'Finnish',
};

export const generalSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  domain: z.string().optional(),
  defaultLanguage: z.string(),
});

export const emailSchema = z.object({
  smtpHost: z.string().optional(),
  smtpPort: z.coerce.number().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  fromEmail: z.string().email().optional().or(z.literal('')),
  fromName: z.string().optional(),
});

// Public widget + WP plugin read from tenant.syncVersion to decide when to
// drop their local cache. Bumping it on demand replaces the old PHP "clear
// cache" script operators used to run by hand.
// Mirrors SUPPORTED_CURRENCIES in packages/shared (the dashboard doesn't depend
// on that package). Codes the exchange-rate feed can't convert fall back to
// showing each property in its own currency.
export const SUPPORTED_CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RUB', 'AED', 'CNY'];

export interface CacheClearResponse {
  data: { tenantId: number; syncVersion: number; clearedAt: string };
}
export interface TenantSettings {
  slugFormat?: string;
  companyName?: string;
  defaultLanguage?: string;
  languages?: string[];
  openRouterApiKey?: string;
  openRouterModel?: string;
  aiChatEnabled?: boolean;
  aiChatNLSearch?: boolean;
  aiChatConversational?: boolean;
  aiChatPropertyQA?: boolean;
  aiChatComparison?: boolean;
  aiChatRecommendations?: boolean;
  aiChatMultilingual?: boolean;
  aiChatWelcomeMessage?: string;
  aiChatMaxMessagesPerConversation?: number;
  aiChatConversationTTLDays?: number;
  aiChatAutoEmailAdmin?: boolean;
  bedroomOptions?: number[];
  bathroomOptions?: number[];
  priceOptions?: { sale?: number[]; rent?: number[] };
  minPrices?: Record<string, number | null>;
  enabledListingTypes?: string[];
  primaryColor?: string;
  wishlistIcon?: 'heart' | 'star' | 'bookmark' | 'save';
  mapVariation?: 'auto' | '0' | '1' | '2';
  mapTiles?: { provider?: 'osm' | 'maptiler' | 'custom'; key?: string; url?: string; attribution?: string };
  recaptchaSiteKey?: string;
  recaptchaSecretKey?: string;
  similarPropertiesLimit?: number;
  baseCurrency?: string;
  inquiryNotificationEmails?: string[];
  inquiryWebhookUrl?: string;
  inquiryAutoReplyEnabled?: boolean;
  // Brochure / PDF
  contactEmail?: string;
  contactPhone?: string;
  defaultBrochureVariant?: 'branded' | 'unbranded';
  [key: string]: unknown;
}
export interface TenantCurrent {
  data: {
    id: number;
    syncVersion?: number;
    domain?: string;
    settings?: TenantSettings;
  };
}

// Webhook management (5E). The dashboard fetches the current URL + last4 of
// the signing secret on mount, surfaces a deliveries table so operators can
// diagnose "why isn't my site receiving updates?" without DB access, and
// exposes rotate + test buttons.
export interface WebhookConfigResponse {
  data: { webhookUrl: string | null; webhookSecretLast4: string };
}
export interface WebhookRotateResponse {
  data: { webhookSecret: string };
}
export interface WebhookDeliveryRow {
  id: number;
  event: string;
  status: 'pending' | 'delivered' | 'failed' | 'skipped';
  attemptCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
  // Detail view also surfaces targetUrl + payload. Populated when the
  // drawer opens via a separate GET /deliveries/:id fetch so the list
  // response stays small.
  targetUrl?: string;
  payload?: Record<string, unknown>;
}
export interface WebhookDeliveriesResponse {
  data: WebhookDeliveryRow[];
}
export interface WebhookDeliveryDetailResponse {
  data: WebhookDeliveryRow;
}

// 5R — sender-domain verification. One row per tenant; if unset the GET
// returns data:null so the UI can branch between "configure" and "verify"
// modes off a single fetch.
export interface SenderDomainDetail {
  id: number;
  domain: string;
  dkimSelector: string;
  spfVerifiedAt: string | null;
  dkimVerifiedAt: string | null;
  dmarcVerifiedAt: string | null;
  records: {
    spf: { host: string; type: string; value: string };
    dkim: { host: string; type: string; value: string };
    dmarc: { host: string; type: string; value: string };
  };
  status: 'verified' | 'partial' | 'unverified';
}
export interface SenderDomainResponse {
  data: SenderDomainDetail | null;
}
export interface SenderDomainVerifyResponse {
  data: {
    spf: { ok: boolean; found: string | null; expected: string };
    dkim: { ok: boolean; found: string | null; expected: string };
    dmarc: { ok: boolean; found: string | null; expected: string };
    status: 'verified' | 'partial' | 'unverified';
  };
}

export interface AiModelOption {
  id: string;
  label: string;
  note: string;
  inputPrice: number | null;
  outputPrice: number | null;
}
