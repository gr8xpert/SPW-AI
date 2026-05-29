export type BrochureVariant = 'branded' | 'unbranded';

export interface BrochurePropertyContext {
  reference: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  priceOnRequest: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  buildSize: number | null;
  plotSize: number | null;
  terraceSize: number | null;
  energyRating: string | null;
  listingTypeLabel: string;
  propertyTypeName: string | null;
  locationName: string | null;
  locationFullPath: string | null;  // e.g. "Estepona, Málaga" (area + municipality)
  images: Array<{ url: string }>;
  features: Array<{ category: string; name: string }>;
}

export interface BrochureTenantContext {
  name: string;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  primaryColor: string;
  websiteUrl: string | null;
}

export interface BrochureContext {
  property: BrochurePropertyContext;
  tenant: BrochureTenantContext;
  labels: Record<string, string>;
  variant: BrochureVariant;
  qrDataUrl: string | null;
  publicUrl: string | null;
  lang: string;
}
