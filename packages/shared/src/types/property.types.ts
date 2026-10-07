// Property shapes as the dashboard API returns them
// (GET /api/dashboard/properties and GET /api/dashboard/properties/:id).
//
// Source of truth: apps/api/src/database/entities/property.entity.ts. Those
// endpoints return the entity row as-is (no serializer beyond the global
// ClassSerializerInterceptor, which only strips @Exclude fields on users), so
// these types follow the entity column by column, adjusted for what JSON
// actually carries:
//   - DECIMAL columns arrive as strings ("450000.00"): mysql2 does not convert
//     them and the data source sets no `decimalNumbers`. See DecimalValue.
//   - Date/timestamp columns arrive as ISO strings.
//
// The public widget API (/api/v1/...) sends a different, translated shape
// (title as a plain string, resolved names, urlSegment); this is NOT that type.

/**
 * A MySQL DECIMAL column. Reads come back as a string like "450000.00"; the
 * write DTOs take numbers. Always coerce with Number(...) before arithmetic,
 * comparisons or formatting, and note "0.00" is truthy.
 */
export type DecimalValue = string | number;

/** An ISO-8601 date string as serialized by the API (DATE columns too). */
export type IsoDateString = string;

/** Per-language text keyed by language code: { en: 'Villa', es: 'Villa' }. */
export type MultilingualText = Record<string, string>;

export const LISTING_TYPES = ['sale', 'rent', 'holiday_rent', 'development'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const PROPERTY_STATUSES = ['draft', 'active', 'sold', 'rented', 'archived'] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

/** Feed integrations a tenant can configure (feed_configs.provider). */
export const FEED_PROVIDERS = ['resales', 'inmoba', 'infocasa', 'redsp', 'kyero', 'odoo'] as const;
export type FeedProvider = (typeof FEED_PROVIDERS)[number];

/** Where a property came from (properties.source): a feed provider or manual entry. */
export const PROPERTY_SOURCES = [...FEED_PROVIDERS, 'manual'] as const;
export type PropertySource = (typeof PROPERTY_SOURCES)[number];

export const BROCHURE_VARIANTS = ['inherit', 'branded', 'unbranded'] as const;
export type BrochureVariant = (typeof BROCHURE_VARIANTS)[number];

export type LocationLevel = 'region' | 'province' | 'area' | 'municipality' | 'town' | 'urbanization';

export interface PropertyImage {
  url: string;
  /** Original feed URL when the photo was copied to R2. */
  sourceUrl?: string;
  /** Set when stored in R2 via media_blobs dedup. */
  contentHash?: string;
  order: number;
  alt?: string;
}

export interface PropertyFloorPlan {
  url: string;
  label?: string;
}

/** The `location` relation. The API sends the full row; these are the fields UIs use. */
export interface PropertyLocationRef {
  id: number;
  parentId: number | null;
  level: LocationLevel;
  name: MultilingualText;
  slug: string;
  lat: DecimalValue | null;
  lng: DecimalValue | null;
}

/** The `propertyType` relation. The API sends the full row; these are the fields UIs use. */
export interface PropertyTypeRef {
  id: number;
  parentId: number | null;
  name: MultilingualText;
  slug: string;
  icon: string | null;
}

/** The agent / salesAgent / lastUpdatedByUser relations (passwordHash and 2FA secret are excluded). */
export interface PropertyUserRef {
  id: number;
  email: string;
  name: string | null;
  role: string;
  avatarUrl: string | null;
}

export interface Property {
  id: number;
  tenantId: number;
  reference: string;
  agentReference: string | null;
  externalId: string | null;
  source: PropertySource;
  listingType: ListingType;
  propertyTypeId: number | null;
  locationId: number | null;
  feedConfigId: number | null;
  urbanization: string | null;

  // Address
  floor: string | null;
  street: string | null;
  streetNumber: string | null;
  postcode: string | null;
  cadastralReference: string | null;

  // Pricing
  price: DecimalValue | null;
  priceTo: DecimalValue | null;
  // What a rental price covers; null = plain price.
  rentalPeriod: 'night' | 'week' | 'month' | null;
  priceOnRequest: boolean;
  currency: string;

  // Metrics (tinyint → number; sizes are DECIMAL)
  bedrooms: number | null;
  bedroomsTo: number | null;
  bathrooms: number | null;
  bathroomsTo: number | null;
  buildSize: DecimalValue | null;
  buildSizeTo: DecimalValue | null;
  plotSize: DecimalValue | null;
  plotSizeTo: DecimalValue | null;
  terraceSize: DecimalValue | null;
  terraceSizeTo: DecimalValue | null;
  gardenSize: DecimalValue | null;
  solariumSize: DecimalValue | null;

  // Financial / tax
  communityFees: DecimalValue | null;
  basuraTax: DecimalValue | null;
  ibiFees: DecimalValue | null;
  commission: DecimalValue | null;
  sharedCommission: boolean;

  // Building / energy
  builtYear: number | null;
  energyConsumption: DecimalValue | null;
  energyRating: string | null;

  // New developments (Resales NewDevName / KeyReady / PriceList)
  developmentName?: string | null;
  keyReady?: boolean | null;
  units?: Array<{
    name: string;
    type: string | null;
    price: number | null;
    builtSize: number | null;
    terraceSize: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    keyReady: boolean | null;
    status: string;
  }> | null;
  distanceToBeach: DecimalValue | null;

  // Content
  title: MultilingualText | null;
  description: MultilingualText | null;

  // Media
  images: PropertyImage[] | null;
  videoUrl: string | null;
  virtualTourUrl: string | null;
  /** Legacy mirror of floorPlans[0].url; prefer floorPlans. */
  floorPlanUrl: string | null;
  floorPlans: PropertyFloorPlan[] | null;
  externalLink: string | null;
  blogUrl: string | null;
  mapLink: string | null;
  websiteUrl: string | null;

  /** Feature ids (FK to the feature catalog). */
  features: number[] | null;

  // Coordinates
  lat: DecimalValue | null;
  lng: DecimalValue | null;
  geoLocationLabel: string | null;

  // SEO
  slug: string | null;
  metaTitle: MultilingualText | null;
  metaDescription: MultilingualText | null;
  metaKeywords: MultilingualText | null;
  pageTitle: MultilingualText | null;
  seoSchemaJson: string | null;

  // Agent / assignment
  agentId: number | null;
  salesAgentId: number | null;
  project: string | null;

  // Selection flags
  isOwnProperty: boolean;
  villaSelection: boolean;
  luxurySelection: boolean;
  apartmentSelection: boolean;

  // Dates
  deliveryDate: IsoDateString | null;
  completionDate: IsoDateString | null;

  // Status
  status: PropertyStatus;
  isFeatured: boolean;
  featuredByFeedId: number | null;
  isPublished: boolean;
  syncEnabled: boolean;
  brochureVariant: BrochureVariant;

  // Feed bookkeeping
  feedLocation: Record<string, string> | null;
  feedType: Record<string, string> | null;
  lockedFields: string[] | null;
  contentHash: string | null;
  lastUpdatedById: number | null;
  propertyTypeReference: string | null;

  // Timestamps
  importedAt: IsoDateString | null;
  publishedAt: IsoDateString | null;
  soldAt: IsoDateString | null;
  lastUpdatedResales: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;

  // Relations, joined by both dashboard endpoints (null when unset).
  location?: PropertyLocationRef | null;
  propertyType?: PropertyTypeRef | null;
  agent?: PropertyUserRef | null;
  salesAgent?: PropertyUserRef | null;
  lastUpdatedByUser?: PropertyUserRef | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** GET /api/dashboard/properties */
export type PropertyListResponse = PaginatedResponse<Property>;

/** Query string accepted by GET /api/dashboard/properties (ListPropertyDto). */
export interface PropertyListQuery {
  search?: string;
  status?: PropertyStatus;
  listingType?: ListingType;
  propertyTypeId?: number;
  /** A place and every place inside it. */
  locationId?: number;
  /** NOTE: the API DTO currently only accepts manual/resales/inmoba/infocasa/redsp. */
  source?: PropertySource;
  isFeatured?: boolean;
  isOwnProperty?: boolean;
  isPublished?: boolean;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  maxBathrooms?: number;
  minBuildSize?: number;
  maxBuildSize?: number;
  minPlotSize?: number;
  maxPlotSize?: number;
  minTerraceSize?: number;
  maxTerraceSize?: number;
  sortBy?: 'reference' | 'createdAt' | 'price' | 'status';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  /** 1–100, default 50. */
  limit?: number;
}
