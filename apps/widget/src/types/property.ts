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
  propertyCount?: number;
}

export interface Location {
  id: number;
  name: string;
  slug: string;
  level: 'country' | 'province' | 'municipality' | 'town' | 'area';
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
  priceOnRequest: boolean;
  currency: string;
  bedrooms?: number;
  bathrooms?: number;
  buildSize?: number;
  plotSize?: number;
  terraceSize?: number;
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
  lat?: number;
  lng?: number;
  videoUrl?: string;
  virtualTourUrl?: string;
  pdfUrl?: string;
  agent?: Agent;
  createdAt?: string;
  updatedAt?: string;
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
