// Buyer Match: a lead is a buyer (or another contact role) with an agent,
// a wishlist (saved search), matched and suggested properties.

export const BUYER_ROLES = [
  'buyer',
  'registered',
  'seller',
  'professional',
  'estate_agent',
  'developer',
  'landlord',
  'tenant',
] as const;
export type BuyerRole = (typeof BUYER_ROLES)[number];

export const PREFERRED_CONTACTS = ['call', 'email', 'whatsapp'] as const;
export type PreferredContact = (typeof PREFERRED_CONTACTS)[number];

// Fixed lists, same values as the client's Odoo form (id_type, sub_status).
export const BUYER_ID_TYPES = ['dni', 'nie', 'passport'] as const;
export type BuyerIdType = (typeof BUYER_ID_TYPES)[number];

export const BUYER_SUB_STATUSES = ['reply_sent', 'stuck', 'called'] as const;
export type BuyerSubStatus = (typeof BUYER_SUB_STATUSES)[number];

// The Contacts tab: other people around the buyer (partner, lawyer's
// assistant…). Not separate records.
export interface RelatedContact {
  name: string;
  relation?: string;
  email?: string;
  phone?: string;
}

export interface BuyerWishlist {
  listingTypes?: ('sale' | 'rent' | 'holiday_rent' | 'development')[];
  locationIds?: number[];
  propertyTypeIds?: number[];
  minBedrooms?: number;
  minBathrooms?: number;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  minBuildSize?: number;
  maxBuildSize?: number;
  minPlotSize?: number;
  maxPlotSize?: number;
  featureIds?: number[];
  sendMatchesTo?: 'buyer' | 'agent' | 'both';
  // Made from a website enquiry, not by the buyer or an agent.
  guessed?: boolean;
}

// How much each wish counts towards a match score (0–10). A feature's own
// weight in featureOverrides (by feature id) replaces `feature`.
export interface BuyerMatchWeights {
  bedrooms: number;
  bathrooms: number;
  buildSize: number;
  plotSize: number;
  feature: number;
  featureOverrides: Record<string, number>;
}

export const DEFAULT_BUYER_MATCH_WEIGHTS: BuyerMatchWeights = {
  bedrooms: 3,
  bathrooms: 2,
  buildSize: 2,
  plotSize: 1,
  feature: 1,
  featureOverrides: {},
};

// A property the agent picked for a buyer, and how far it got.
export const SUGGESTION_STATUSES = ['suggested', 'sent', 'visited', 'interested', 'not_interested'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

// Near misses (milestone G): how far outside a must-have still counts.
export interface BuyerNearMissSettings {
  enabled: boolean;
  // % of the budget (0 = budget misses off).
  budgetPercent: number;
  // km from a wished town (0 = place misses off).
  nearbyKm: number;
}

// New-listing alerts (milestone H). Every alert waits for the agent.
export interface BuyerAlertSettings {
  enabled: boolean;
  // What "Approve" does: send in the daily digest, or at once.
  delivery: 'digest' | 'instant';
  // When the daily digest goes out, in the agency's time zone (HH:MM).
  digestTime: string;
  // A price cut of at least this many % makes a price-drop alert.
  priceDropPercent: number;
}

// tenants.settings.buyerMatch
export interface BuyerMatchSettings {
  // Who gets new website buyers.
  assignMode: 'default' | 'round_robin';
  defaultAgentId: number | null;
  rotationAgentIds: number[];
  // Agents (role "user") see only their own buyers unless this is on.
  agentsSeeAll: boolean;
  // A buyer with no activity for this many days is flagged.
  staleDays: number;
  weights: BuyerMatchWeights;
  // The client's property page per language, for links in emails:
  // { default: 'https://site.com/{lang}/property/{segment}', nl: '…' }.
  // SPM can't know these URLs, so the client sets them.
  propertyUrlPatterns: Record<string, string>;
  // The agency's personal buyer page per language ({ default: 'https://site.com/my-properties/' });
  // the buyer's code is added as ?t=. Empty = the page the WP plugin made,
  // else the SPM fallback page.
  buyerPageUrls: Record<string, string>;
  nearMiss: BuyerNearMissSettings;
  alerts: BuyerAlertSettings;
  // Milestone I: the agent's reminder this many minutes before a viewing (0 = off),
  // the agent's daily email time (HH:MM, agency time zone), the hot buyer threshold.
  viewingReminderMinutes: number;
  agentDigestTime: string;
  hotScore: number;
}

export const DEFAULT_BUYER_MATCH_SETTINGS: BuyerMatchSettings = {
  assignMode: 'default',
  defaultAgentId: null,
  rotationAgentIds: [],
  agentsSeeAll: false,
  staleDays: 14,
  weights: DEFAULT_BUYER_MATCH_WEIGHTS,
  propertyUrlPatterns: {},
  buyerPageUrls: {},
  nearMiss: { enabled: true, budgetPercent: 10, nearbyKm: 10 },
  alerts: { enabled: false, delivery: 'digest', digestTime: '08:00', priceDropPercent: 5 },
  viewingReminderMinutes: 60,
  agentDigestTime: '07:30',
  hotScore: 6,
};

// Phase 3 (milestone L): rules read from the buyer's Internal Notes ("does
// NOT want a ground floor"). A closed set, checked by plain code against the
// listing data; a match that breaks one is flagged and its score lowered.
export const RULE_NUMBER_FIELDS = [
  'price', 'bedrooms', 'bathrooms', 'buildSize', 'plotSize', 'terraceSize', 'gardenSize', 'builtYear', 'distanceToBeach', 'communityFees',
] as const;
export type RuleNumberField = (typeof RULE_NUMBER_FIELDS)[number];

export type NoteRuleBody =
  | { kind: 'floor'; mode: 'avoid' | 'require'; value: 'ground' | 'top' }
  | { kind: 'feature'; mode: 'avoid' | 'require'; featureId: number }
  | { kind: 'type'; mode: 'avoid'; propertyTypeId: number }
  | { kind: 'place'; mode: 'avoid'; locationId: number }
  | { kind: 'max' | 'min'; field: RuleNumberField; value: number };

export type NoteRule = NoteRuleBody & {
  // The rule's key (`floor:avoid:ground`, `feature:require:12`, `max:price`):
  // one rule per key.
  id: string;
  // The words it came from.
  text: string;
  // hard = "does NOT want", "never", "must"; soft = "prefers", "ideally".
  strength: 'hard' | 'soft';
};
