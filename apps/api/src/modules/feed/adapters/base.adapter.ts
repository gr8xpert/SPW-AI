import { FeedCredentials, FeedFieldMapping } from '../../../database/entities/feed-config.entity';

export interface FeedPropertyImage {
  url: string;
  order: number;
  alt?: string;
}

// Levels match the canonical 6-step hierarchy used throughout the system:
// Region > Province > Area > Municipality > Town > Urbanization.
// `country` is metadata only — it's not stored as a level (tenants are
// country-scoped). `region` is usually empty in feeds and filled by AI
// enrichment from the province (e.g. Málaga → Andalucía).
export interface FeedPropertyLocation {
  name: string;
  region?: string;
  province?: string;
  area?: string;
  municipality?: string;
  town?: string;
  urbanization?: string;
  country?: string;
  externalId?: string;
}

export interface FeedProperty {
  externalId: string;
  reference: string;
  agentReference?: string;
  title: Record<string, string>;
  description: Record<string, string>;
  listingType: 'sale' | 'rent' | 'holiday_rent' | 'development';
  propertyType: string;
  // Provider's own type code and group, where it sends them (Resales:
  // SubtypeId1 "1-4", Type "Apartment", TypeId "1-1"). Matched against the
  // property-type template before the name.
  propertyTypeCode?: string;
  propertyTypeGroup?: string;
  propertyTypeGroupCode?: string;
  // One price, or a range: price = from, priceTo = to (set only when higher).
  price: number | null;
  priceTo?: number;
  // Rentals: what the price covers, when the feed says.
  rentalPeriod?: 'night' | 'week' | 'month';
  priceOnRequest?: boolean;
  currency: string;
  // Developments send ranges ("1 - 3"): the low end here, the high end in
  // the matching *To field (set only when higher).
  bedrooms?: number;
  bedroomsTo?: number;
  bathrooms?: number;
  bathroomsTo?: number;
  buildSize?: number;
  buildSizeTo?: number;
  plotSize?: number;
  plotSizeTo?: number;
  terraceSize?: number;
  terraceSizeTo?: number;
  gardenSize?: number;
  images: FeedPropertyImage[];
  features: string[];
  // Optional per-feature category hint (lowercase feature name -> internal category).
  // Adapters can populate this to drive proper categorization during import; missing
  // entries fall back to 'other'.
  featureCategories?: Record<string, string>;
  location: FeedPropertyLocation;
  lat?: number;
  lng?: number;
  // Spelled a dozen ways by feeds (zipcode, zip, postal_code, PostCode…).
  // Worth carrying even when a feed gives no coordinates: a postcode can be
  // put on the map, a town name alone puts every listing on one dot.
  postcode?: string;

  // The agency's own listing rather than one shared from the network. Drives
  // the own="yes" / own-first="yes" filters, and marks the listings worth
  // giving real coordinates to by hand.
  isOwnProperty?: boolean;
  videoUrl?: string;
  virtualTourUrl?: string;
  deliveryDate?: string;
  communityFees?: number;
  ibiFees?: number;
  basuraTax?: number;
  builtYear?: number;
  energyRating?: string;
  // New developments: name, ready to move into, and the units' price list.
  developmentName?: string;
  keyReady?: boolean;
  units?: FeedDevelopmentUnit[];
}

export interface FeedDevelopmentUnit {
  name: string;
  type: string | null;
  price: number | null;
  builtSize: number | null;
  terraceSize: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  keyReady: boolean | null;
  status: string;
}

export interface FeedImportResult {
  properties: FeedProperty[];
  totalCount: number;
  hasMore: boolean;
  page?: number;
}

export interface FeedValidationResult {
  valid: boolean;
  error?: string;
}

export abstract class BaseFeedAdapter {
  abstract readonly provider: string;
  abstract readonly displayName: string;

  abstract validateCredentials(credentials: FeedCredentials): Promise<FeedValidationResult>;

  /**
   * Fetches properties from the feed provider
   * @param credentials Provider credentials
   * @param page Page number for pagination (if supported)
   * @param limit Number of properties per page
   */
  abstract fetchProperties(
    credentials: FeedCredentials,
    page?: number,
    limit?: number,
  ): Promise<FeedImportResult>;

  /**
   * Applies custom field mapping to a property
   */
  applyFieldMapping(
    property: FeedProperty,
    mapping: FeedFieldMapping | null,
  ): FeedProperty {
    if (!mapping) return property;

    const mapped = { ...property };

    for (const [externalField, internalField] of Object.entries(mapping)) {
      if (property[externalField as keyof FeedProperty] !== undefined) {
        (mapped as any)[internalField] = property[externalField as keyof FeedProperty];
      }
    }

    return mapped;
  }

  /**
   * Normalizes listing type from provider-specific values
   */
  protected normalizeListingType(value: string): 'sale' | 'rent' | 'holiday_rent' | 'development' {
    const normalized = value.toLowerCase();

    if (normalized.includes('holiday') || normalized.includes('vacation') || normalized.includes('vacacional') || normalized.includes('temporada')) {
      return 'holiday_rent';
    }

    if (normalized.includes('rent') || normalized.includes('alquiler')) {
      return 'rent';
    }

    if (normalized.includes('new') || normalized.includes('development') || normalized.includes('obra')) {
      return 'development';
    }

    return 'sale';
  }

  /**
   * Extracts multilingual content from various formats
   */
  protected extractMultilingual(
    data: any,
    defaultLang: string = 'en',
  ): Record<string, string> {
    if (typeof data === 'string') {
      return { [defaultLang]: data };
    }

    if (typeof data === 'object' && data !== null) {
      const result: Record<string, string> = {};

      // Handle { EN: "...", ES: "..." } format
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
          result[key.toLowerCase()] = value;
        }
      }

      return result;
    }

    return { [defaultLang]: '' };
  }
}
