export type BrochureVariant = 'branded' | 'unbranded';

export interface BrochurePropertyContext {
  reference: string;
  title: string;
  description: string;
  price: number | null;
  priceTo: number | null;
  rentalPeriod: string | null;
  listingType: string;
  currency: string;
  priceOnRequest: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  buildSize: number | null;
  plotSize: number | null;
  terraceSize: number | null;
  // A development's upper end (1–3 beds, 80–140 m²); null for a single home.
  bedroomsTo: number | null;
  bathroomsTo: number | null;
  buildSizeTo: number | null;
  plotSizeTo: number | null;
  terraceSizeTo: number | null;
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
