import type { Property } from '../../database/entities';
import { displayName } from './idealista/idealista-builder';
import type { KyeroLocationRow } from './kyero/kyero-builder';

// One listing in the JSON feed, and the lookups both URL feeds name things with.

export interface ExportLookups {
  locations: Map<number, KyeroLocationRow>;
  types: Map<number, { name: Record<string, string> | null }>;
  features: Map<number, { name: Record<string, string> | null }>;
}

export interface ExportProperty {
  id: string;
  reference: string;
  date: string;
  price: number;
  currency: string;
  type: string;
  town: string;
  province: string;
  beds: number;
  baths: number;
  buildSize: number;
  plotSize: number;
  descriptions: Record<string, string>;
  images: string[];
  features: string[];
  lat?: number;
  lng?: number;
  status: string;
}

export function toExportProperty(p: Property, lookups: ExportLookups): ExportProperty {
  return {
    id: p.reference,
    reference: p.reference,
    date: p.updatedAt.toISOString().split('T')[0],
    price: p.price || 0,
    currency: p.currency,
    type: displayName(p.propertyType?.name),
    town: displayName(p.location?.name),
    province: provinceOf(p, lookups.locations),
    beds: p.bedrooms || 0,
    baths: p.bathrooms || 0,
    buildSize: p.buildSize || 0,
    plotSize: p.plotSize || 0,
    descriptions: p.description || {},
    images: [...(p.images || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((img) => img.url),
    features: (p.features || [])
      .map((fId) => displayName(lookups.features.get(fId)?.name))
      .filter((f): f is string => !!f),
    lat: p.lat ?? undefined,
    lng: p.lng ?? undefined,
    status: p.status,
  };
}

function provinceOf(p: Property, locations: Map<number, KyeroLocationRow>): string {
  const seen = new Set<number>();
  let cur = p.locationId != null ? locations.get(p.locationId) : undefined;
  while (cur && !seen.has(cur.id)) {
    if (cur.level === 'province') return displayName(cur.name);
    seen.add(cur.id);
    cur = cur.parentId != null ? locations.get(cur.parentId) : undefined;
  }
  return p.feedLocation?.province || '';
}

// One row of the feed, indented as JSON.stringify(rows, null, 2) would indent it.
// JSON strings hold no raw line breaks, so every line start is a real one.
export function jsonFeedRow(row: ExportProperty): string {
  return JSON.stringify(row, null, 2).replace(/^/gm, '  ');
}

export function joinJsonFeedRows(rows: string[]): string {
  return rows.length ? `[\n${rows.join(',\n')}\n]` : '[]';
}
