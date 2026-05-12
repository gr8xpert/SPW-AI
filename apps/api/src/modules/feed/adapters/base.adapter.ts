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
  price: number | null;
  priceOnRequest?: boolean;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  buildSize?: number;
  plotSize?: number;
  terraceSize?: number;
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
  videoUrl?: string;
  virtualTourUrl?: string;
  deliveryDate?: string;
  communityFees?: number;
  ibiFees?: number;
  basuraTax?: number;
  builtYear?: number;
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
