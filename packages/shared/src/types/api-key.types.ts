import type { ListingType } from './property.types';

/**
 * What a website key may show (2026-10-28). Every part is optional; an empty
 * scope shows everything, like the client's main key. The API applies it to
 * every public query, so a visitor can narrow a search but never widen it.
 */
export interface ApiKeyScope {
  /** Places, each with everything below it. */
  locationIds?: number[];
  /** Property types, each with its sub-types. */
  propertyTypeIds?: number[];
  listingTypes?: ListingType[];
  /** Feature ids; `featureMatch` says whether a listing needs all or any. */
  features?: number[];
  featureMatch?: 'all' | 'any';
  priceMin?: number;
  priceMax?: number;
  /** Only the agency's own listings (not feed listings). */
  ownOnly?: boolean;
  featuredOnly?: boolean;
  /** Listings never shown by this key. */
  excludeRefs?: string[];
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
  createdAt: string;
}
