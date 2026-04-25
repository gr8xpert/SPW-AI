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
  features: Feature[];
  isFeatured: boolean;
  lat?: number;
  lng?: number;
  videoUrl?: string;
  virtualTourUrl?: string;
  pdfUrl?: string;
  agent?: Agent;
  createdAt?: string;
  updatedAt?: string;
}

export type ListingType = 'sale' | 'rent' | 'holiday_rent' | 'development';

export interface SearchResults {
  data: Property[];
  meta: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}
