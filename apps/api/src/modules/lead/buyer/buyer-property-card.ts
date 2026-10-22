import type { SelectQueryBuilder } from 'typeorm';
import type { Property } from '../../../database/entities';

// The listing as the Matched and Suggested tabs show it: one light shape,
// loaded the same way everywhere (no description, all images trimmed to the
// first one).
export interface BuyerPropertyCard {
  id: number;
  reference: string;
  agentReference: string | null;
  title: Record<string, string> | null;
  slug: string | null;
  listingType: string;
  status: string;
  price: number | null;
  priceTo: number | null;
  rentalPeriod: string | null;
  currency: string;
  priceOnRequest: boolean;
  bedrooms: number | null;
  bedroomsTo: number | null;
  bathrooms: number | null;
  bathroomsTo: number | null;
  buildSize: number | null;
  buildSizeTo: number | null;
  plotSize: number | null;
  plotSizeTo: number | null;
  virtualTourUrl: string | null;
  image: string | null;
  location: { id: number; name: Record<string, string> } | null;
  propertyType: { id: number; name: Record<string, string> } | null;
}

const COLUMNS = [
  'id', 'reference', 'agentReference', 'title', 'slug', 'listingType', 'status', 'price', 'priceTo', 'rentalPeriod',
  'currency', 'priceOnRequest', 'bedrooms', 'bedroomsTo', 'bathrooms', 'bathroomsTo', 'buildSize', 'buildSizeTo',
  'plotSize', 'plotSizeTo', 'virtualTourUrl', 'images',
];

// Joins and selects what toCard needs. The query's alias must be `p`.
export function selectCard(qb: SelectQueryBuilder<Property>): SelectQueryBuilder<Property> {
  return qb
    .select(COLUMNS.map((c) => `p.${c}`))
    .leftJoin('p.location', 'cardLocation')
    .addSelect(['cardLocation.id', 'cardLocation.name'])
    .leftJoin('p.propertyType', 'cardType')
    .addSelect(['cardType.id', 'cardType.name']);
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function toCard(p: Property): BuyerPropertyCard {
  const img = [...(p.images || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  return {
    id: p.id,
    reference: p.reference,
    agentReference: p.agentReference ?? null,
    title: (p.title as Record<string, string>) ?? null,
    slug: p.slug ?? null,
    listingType: p.listingType,
    status: p.status,
    price: n(p.price),
    priceTo: n(p.priceTo),
    rentalPeriod: p.rentalPeriod ?? null,
    currency: p.currency,
    priceOnRequest: !!p.priceOnRequest,
    bedrooms: n(p.bedrooms),
    bedroomsTo: n(p.bedroomsTo),
    bathrooms: n(p.bathrooms),
    bathroomsTo: n(p.bathroomsTo),
    buildSize: n(p.buildSize),
    buildSizeTo: n(p.buildSizeTo),
    plotSize: n(p.plotSize),
    plotSizeTo: n(p.plotSizeTo),
    virtualTourUrl: p.virtualTourUrl ?? null,
    image: img?.url || null,
    location: p.location ? { id: p.location.id, name: p.location.name } : null,
    propertyType: p.propertyType ? { id: p.propertyType.id, name: p.propertyType.name } : null,
  };
}
