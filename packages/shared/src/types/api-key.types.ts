import type { ListingType } from './property.types';

/** The filters a key can set, for all its listing types or for one of them. */
export interface ApiKeyFilters {
  /** Places, each with everything below it. */
  locationIds?: number[];
  /** Property types, each with its sub-types. */
  propertyTypeIds?: number[];
  /** Feature ids; `featureMatch` says whether a listing needs all or any. */
  features?: number[];
  featureMatch?: 'all' | 'any';
  priceMin?: number;
  priceMax?: number;
  /** A development's range (1–3 beds) counts when it overlaps these. */
  bedsMin?: number;
  bedsMax?: number;
  bathsMin?: number;
  bathsMax?: number;
  /** Only the agency's own listings (not feed listings). */
  ownOnly?: boolean;
  featuredOnly?: boolean;
}

/**
 * What a website key may show (2026-10-28). Every part is optional; an empty
 * scope shows everything, like the client's main key. The API applies it to
 * every public query, so a visitor can narrow a search but never widen it.
 */
export interface ApiKeyScope extends ApiKeyFilters {
  listingTypes?: ListingType[];
  /** Listings never shown by this key. */
  excludeRefs?: string[];
  /**
   * Different filters per listing type (2026-11-02): the key shows each type
   * under its own filters, together. Replaces the filters above; only set when
   * the types' filters differ, so a simple key stays in the plain form.
   */
  byListingType?: Partial<Record<ListingType, ApiKeyFilters>>;
}

/**
 * What a website looks like when it uses this key, over the client's own
 * settings. Anything left out falls back to Settings.
 */
export interface ApiKeySettings {
  /** Display currency, e.g. "GBP". */
  currency?: string;
  /** Brand colour, e.g. "#0a2a66". */
  primaryColor?: string;
  /** Who gets this website's enquiries (instead of Settings -> Email). */
  inquiryEmails?: string[];
}

/** A website key as the dashboard lists it. The raw key is never returned after creation. */
export interface ApiKeySummary {
  id: number;
  name: string;
  last4: string;
  scope: ApiKeyScope;
  /** Hosts the key works on (subdomains included). Empty = any site. */
  allowedDomains: string[];
  settings: ApiKeySettings;
  isActive: boolean;
  lastUsedAt: string | null;
  lastUsedOrigin: string | null;
  /** Token for this key's XML feed; null = the feed is off. */
  feedKey: string | null;
  feedLastUsedAt: string | null;
  createdAt: string;
}
