export interface PropertyImage {
  id: number;
  url: string;
  thumbnailUrl?: string;
  alt?: string;
  order: number;
}

export interface PropertyType {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  // Types form a tree (Apartment → Penthouse, Commercial → Bar). The API has
  // always sent this; the widget listed them flat until it was declared.
  parentId?: number;
  propertyCount?: number;
}

export interface Location {
  id: number;
  name: string;
  slug: string;
  level: 'country' | 'region' | 'province' | 'area' | 'municipality' | 'town' | 'urbanization';
  parentId?: number;
  propertyCount?: number;
  lat?: number;
  lng?: number;
}

export interface Feature {
  id: number;
  name: string;
  category: string;
  icon?: string;
}

export interface DevelopmentUnit {
  name: string;
  type: string | null;
  // Null on sold units.
  price: number | null;
  builtSize: number | null;
  terraceSize: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  keyReady: boolean | null;
  // 'available' | 'reserved' | 'sold' (Resales StatusCode, lower case).
  status: string;
}

export interface Agent {
  name: string;
  email?: string;
  phone?: string;
  photo?: string;
  title?: string;
}

export interface Property {
  id: number;
  reference: string;
  // Optional client-agency reference (e.g. MLSC number). When present and the
  // widget config has useAgentReferenceAsDisplay=true, this replaces `reference`
  // as the user-facing identifier on cards + detail page. URL slugs and API
  // lookups keep using `reference`.
  agentReference?: string;
  title: string;
  description: string;
  shortDescription?: string;
  listingType: ListingType;
  propertyType: PropertyType;
  location: Location;
  address?: string;
  zipCode?: string;
  price: number;
  // A range when higher than price ("€1,750 – €2,450"); null = single price.
  priceTo?: number | string | null;
  // What a rental price covers; null = plain price.
  rentalPeriod?: 'night' | 'week' | 'month' | null;
  priceOnRequest: boolean;
  currency: string;
  // Developments are ranges: the *To fields hold the high end when higher.
  bedrooms?: number;
  bedroomsTo?: number | string | null;
  bathrooms?: number;
  bathroomsTo?: number | string | null;
  buildSize?: number;
  buildSizeTo?: number | string | null;
  plotSize?: number;
  plotSizeTo?: number | string | null;
  terraceSize?: number;
  terraceSizeTo?: number | string | null;
  gardenSize?: number;
  year?: number;
  floor?: string;
  orientation?: string;
  parking?: string;
  energyRating?: string;
  communityFees?: number;
  status?: string;
  images: PropertyImage[];
  // API stores features as an array of feature IDs (FK to the global feature
  // catalog hydrated into store.features). Consumers must resolve IDs → names
  // via the catalog; see resolveFeatures() in core/feature-utils.ts.
  features: number[];
  isFeatured: boolean;
  isOwnProperty?: boolean;
  // New developments: name, ready to move into, and the units' price list.
  developmentName?: string | null;
  keyReady?: boolean | null;
  units?: DevelopmentUnit[] | null;
  lat?: number;
  lng?: number;
  videoUrl?: string;
  virtualTourUrl?: string;
  pdfUrl?: string;
  agent?: Agent;
  createdAt?: string;
  updatedAt?: string;
  // Page address on the client site (`/{detail-slug}/{urlSegment}`), computed
  // by the API from the dashboard's slug format and the property's own slug.
  urlSegment?: string;
  slug?: string | null;
  // SEO section of the property in the dashboard (in the page's language).
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  pageTitle?: string;
  seoSchemaJson?: string | null;
  // Widget-internal marker. Set to true by DataLoader.getProperty() to signal
  // this is a full detail payload (all images, full description, etc). Search
  // results leave this undefined so DetailTemplate can detect thin data and
  // re-fetch. Never sent to the API.
  __detailFull?: boolean;
}

export type ListingType = 'sale' | 'rent' | 'holiday_rent' | 'development' | 'offplan';

export interface SearchResults {
  data: Property[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
