import { Location, LocationBoundary } from '../../database/entities';

// How far a place may sit from an ancestor's point before we stop believing it,
// by the level of that ancestor — because what makes a distance suspicious is
// the size of the thing it is measured from. Marbella is 48 km from the point
// stored for "Malaga" (Nominatim answers with the city, not the middle of the
// province) and is still plainly in Malaga; Montemar is 6,457 km from
// Torremolinos and is plainly in Tanzania.
//
// Shared by the geocoder (which fixes the stored value) and the map (which
// refuses to draw a bad one either way).
export const MAX_KM_FROM: Record<string, number> = {
  urbanization: 10,
  town: 20,
  municipality: 45,
  area: 90,
  province: 200,
  region: 500,
  country: 1500,
};
export const DEFAULT_MAX_KM = 150;

export function maxKmFrom(anchorLevel: string | null | undefined): number {
  return (anchorLevel ? MAX_KM_FROM[anchorLevel] : undefined) ?? DEFAULT_MAX_KM;
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface ResolvedPoint {
  lat: number;
  lng: number;
  // True when this is an ancestor's point because the place's own was not
  // believable — the listing is in the right town, not the right street.
  borrowed: boolean;
}

/**
 * Where each place should actually be drawn.
 *
 * A listing with no GPS of its own is drawn at its place's point, so one bad
 * row puts every listing in that place on the wrong continent. Correcting the
 * stored value is worth doing, but the map must not depend on anyone having
 * done it: here each place is checked against its parent as the map is built,
 * and an impossible one is drawn at its parent instead. Places are walked
 * parents-first, so a bad parent is replaced before its children are judged
 * against it.
 *
 * A place whose whole ancestry is unusable gets no point at all, and its
 * listings simply do not appear on the map — which is the honest outcome, and
 * far better than a pin in the wrong country.
 */
export function resolveLocationPoints(locations: Location[]): Map<number, ResolvedPoint> {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const resolved = new Map<number, ResolvedPoint>();
  // Whose coordinate each accepted point actually is. A town that fell back to
  // its province holds a province-sized point, so the town's own children must
  // be judged with a province's allowance, not a town's.
  const pointLevel = new Map<number, string>();

  const depth = (row: Location): number => {
    let d = 0;
    let parentId = row.parentId;
    let hops = 0;
    while (parentId && hops < 8) {
      const parent = byId.get(parentId);
      if (!parent) break;
      d++;
      parentId = parent.parentId;
      hops++;
    }
    return d;
  };

  for (const row of [...locations].sort((a, b) => depth(a) - depth(b))) {
    const own = row.lat != null && row.lng != null
      ? { lat: Number(row.lat), lng: Number(row.lng) }
      : null;

    // The nearest ancestor we have already accepted a point for.
    let anchor: ResolvedPoint | undefined;
    let anchorLevel: string | undefined;
    let parentId = row.parentId;
    let hops = 0;
    while (parentId && hops < 8) {
      anchor = resolved.get(parentId);
      if (anchor) {
        anchorLevel = pointLevel.get(parentId);
        break;
      }
      const parent = byId.get(parentId);
      if (!parent) break;
      parentId = parent.parentId;
      hops++;
    }

    if (own) {
      if (!anchor || distanceKm(own.lat, own.lng, anchor.lat, anchor.lng) <= maxKmFrom(anchorLevel)) {
        resolved.set(row.id, { ...own, borrowed: false });
        pointLevel.set(row.id, row.level);
        continue;
      }
    }

    if (anchor) {
      resolved.set(row.id, { lat: anchor.lat, lng: anchor.lng, borrowed: true });
      if (anchorLevel) pointLevel.set(row.id, anchorLevel);
    }
  }

  return resolved;
}

// An outline big enough to be worth sending, and small enough to be worth
// drawing against: a region's is thousands of points and covers a third of
// Spain, which fences nothing useful.
const MAX_FENCE_POINTS = 1200;

function countPoints(boundary: { type: string; coordinates: unknown }): number {
  const rings = boundary.type === 'Polygon'
    ? (boundary.coordinates as number[][][])
    : (boundary.coordinates as number[][][][]).flat();
  return rings.reduce((total, ring) => total + ring.length, 0);
}

/**
 * The outline a place's listings should be kept inside.
 *
 * Most places have no outline of their own: OpenStreetMap only holds a shape
 * for somewhere mapped as an area, and a neighbourhood like Torremuelle is a
 * single point. Its municipality — Benalmádena — is an administrative area
 * whose boundary follows the coastline, which is exactly what is needed to
 * stop a listing being drawn in the sea. So: the place's own outline if it has
 * one, otherwise the nearest ancestor's.
 */
export function fenceFor(row: Location, byId: Map<number, Location>): LocationBoundary | null {
  let current: Location | undefined = row;
  let hops = 0;
  while (current && hops++ < 6) {
    const boundary = current.boundary;
    if (boundary && countPoints(boundary) <= MAX_FENCE_POINTS) return boundary;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}
