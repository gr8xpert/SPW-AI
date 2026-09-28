import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Location, LocationBoundary } from '../../database/entities';
import { distanceKm, maxKmFrom } from './location-points';

export interface GeocodeOutcome {
  checked: number;
  fixed: Array<{ id: number; name: string; from: string | null; to: string }>;
  rejected: Array<{ id: number; name: string; reason: string }>;
  unchanged: number;
}

// Nominatim asks for no more than one request a second and a User-Agent that
// identifies the caller. Both are conditions of use, not suggestions.
const RATE_LIMIT_MS = 1100;
const USER_AGENT = 'SmartPropertyManager/1.0 (+https://spw-ai.com)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// The distance rule lives in location-points.ts, where the map uses it too.

@Injectable()
export class LocationGeocodeService {
  private readonly logger = new Logger(LocationGeocodeService.name);
  private lastRequest = 0;

  constructor(
    @InjectRepository(Location) private readonly locations: Repository<Location>,
  ) {}

  /**
   * Fills in (or corrects) the coordinates of a client's places.
   *
   * Listings that carry no GPS of their own are drawn at their place's point,
   * so one wrong row moves every listing in that place with it — which is how
   * seven Costa del Sol properties ended up in Tanzania.
   *
   * @param onlyMissing leave places that already have coordinates alone
   */
  async run(tenantId: number, onlyMissing = false): Promise<GeocodeOutcome> {
    // One list, so a parent corrected in this pass is the parent a child is
    // then checked against. Fetching twice gave two sets of objects and the
    // children were judged against the old, wrong coordinates: Montemar's
    // correct answer was thrown out for being 730 km from a Torremolinos that
    // was itself in Algeria at the time.
    const all = await this.locations.find({ where: { tenantId }, order: { id: 'ASC' } });
    const byId = new Map(all.map((l) => [l.id, l]));

    // `boundary` is a hidden column (see the entity), so the rows above do not
    // carry it. We only need to know which places already have an outline, to
    // avoid rewriting one on every run.
    const withOutline = new Set<number>(
      (
        await this.locations
          .createQueryBuilder('l')
          .select('l.id', 'id')
          .where('l.tenantId = :tenantId', { tenantId })
          .andWhere('l.boundary IS NOT NULL')
          .getRawMany<{ id: number }>()
      ).map((r) => Number(r.id)),
    );

    const depth = (row: Location): number => {
      let d = 0;
      let parentId = row.parentId;
      let hops = 0;
      while (parentId && hops < 6) {
        const parent = byId.get(parentId);
        if (!parent) break;
        d++;
        parentId = parent.parentId;
        hops++;
      }
      return d;
    };

    const rows = (onlyMissing ? all.filter((l) => l.lat == null || l.lng == null) : [...all])
      .sort((a, b) => depth(a) - depth(b));

    const out: GeocodeOutcome = { checked: 0, fixed: [], rejected: [], unchanged: 0 };

    for (const row of rows) {
      out.checked++;
      const label = this.nameOf(row);
      const anchor = this.anchorFor(row, byId);
      // Measured by the size of what we are comparing against: 48 km from the
      // point stored for a province is ordinary, 48 km from a town is not.
      const limit = maxKmFrom(anchor?.row.level);
      const before = row.lat != null && row.lng != null ? `${row.lat},${row.lng}` : null;

      const found = await this.lookup(this.queryFor(row, byId));
      const fits = (lat: number, lng: number) =>
        !anchor || distanceKm(lat, lng, anchor.lat, anchor.lng) <= limit;

      if (found && fits(found.lat, found.lng)) {
        const after = `${found.lat.toFixed(5)},${found.lng.toFixed(5)}`;
        if (before === after) {
          // The point is right but the outline may be new to us.
          if (found.boundary && !withOutline.has(row.id)) {
            row.boundary = found.boundary;
            await this.locations.save(row);
          }
          out.unchanged++;
          continue;
        }
        row.lat = Number(found.lat.toFixed(5));
        row.lng = Number(found.lng.toFixed(5));
        if (found.boundary) row.boundary = found.boundary;
        await this.locations.save(row);
        out.fixed.push({ id: row.id, name: label, from: before, to: after });
        continue;
      }

      // Nothing usable came back. If what is already stored is itself
      // impossible — the other side of the world, or a village of the same
      // name 275 km away — leaving it there would keep every listing in that
      // place on the wrong continent. Fall back to the parent's point, which
      // is at worst vague and at best the right town.
      const storedIsWrong =
        row.lat != null && row.lng != null && !fits(Number(row.lat), Number(row.lng));

      if (storedIsWrong && anchor) {
        row.lat = Number(anchor.lat.toFixed(5));
        row.lng = Number(anchor.lng.toFixed(5));
        await this.locations.save(row);
        out.fixed.push({
          id: row.id,
          name: label,
          from: before,
          to: `${row.lat},${row.lng} (moved to ${this.nameOf(anchor.row)} — could not place it exactly)`,
        });
        continue;
      }

      out.rejected.push({
        id: row.id,
        name: label,
        reason: found
          ? `found ${Math.round(distanceKm(found.lat, found.lng, anchor!.lat, anchor!.lng))} km from ${this.nameOf(anchor!.row)} — too far to be the same place`
          : `nothing found for "${this.queryFor(row, byId)}"`,
      });
    }

    this.logger.log(
      `Geocoded tenant ${tenantId}: ${out.checked} checked, ${out.fixed.length} corrected, ${out.rejected.length} left alone`,
    );
    return out;
  }

  /** "Los Alamos, Torremolinos, Malaga, Spain" — the context is what makes it right. */
  private queryFor(row: Location, byId: Map<number, Location>): string {
    const parts = [this.nameOf(row)];
    let parentId = row.parentId;
    let hops = 0;
    while (parentId && hops < 4) {
      const parent = byId.get(parentId);
      if (!parent) break;
      parts.push(this.nameOf(parent));
      parentId = parent.parentId;
      hops++;
    }
    return parts.filter(Boolean).join(', ');
  }

  /** The nearest ancestor that already has coordinates, to sanity-check against. */
  private anchorFor(row: Location, byId: Map<number, Location>): { lat: number; lng: number; row: Location } | null {
    let parentId = row.parentId;
    let hops = 0;
    while (parentId && hops < 4) {
      const parent = byId.get(parentId);
      if (!parent) return null;
      if (parent.lat != null && parent.lng != null) {
        return { lat: Number(parent.lat), lng: Number(parent.lng), row: parent };
      }
      parentId = parent.parentId;
      hops++;
    }
    return null;
  }

  private nameOf(row: Location): string {
    const name = row.name as unknown;
    if (typeof name === 'string') return name;
    const map = (name ?? {}) as Record<string, string>;
    return map.en || Object.values(map)[0] || '';
  }

  private async lookup(query: string): Promise<{ lat: number; lng: number; boundary?: LocationBoundary } | null> {
    const wait = RATE_LIMIT_MS - (Date.now() - this.lastRequest);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequest = Date.now();

    try {
      // polygon_geojson gives the town's outline; polygon_threshold asks
      // Nominatim to simplify it before sending, which keeps a coastline from
      // arriving as 40,000 points.
      const url = `${NOMINATIM}?format=json&limit=1&polygon_geojson=1&polygon_threshold=0.0008&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
      if (!res.ok) return null;
      const body = (await res.json()) as Array<{ lat?: string; lon?: string; geojson?: { type?: string; coordinates?: unknown } }>;
      const first = Array.isArray(body) ? body[0] : null;
      if (!first?.lat || !first?.lon) return null;
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return { lat, lng, boundary: boundaryOf(first.geojson) };
    } catch (err) {
      this.logger.warn(`Geocoding "${query}" failed: ${(err as Error).message}`);
      return null;
    }
  }
}

// Nominatim answers with a Polygon, a MultiPolygon, or a Point when it has no
// outline for the place. Only a real outline is worth keeping, and only if it
// is small enough to send to every visitor: a town of more than ~4,000 points
// is dropped rather than bloat the map response.
const MAX_BOUNDARY_POINTS = 4000;

function boundaryOf(geojson: { type?: string; coordinates?: unknown } | undefined): LocationBoundary | undefined {
  if (!geojson || (geojson.type !== 'Polygon' && geojson.type !== 'MultiPolygon')) return undefined;
  const count = countPositions(geojson.coordinates);
  if (count === 0 || count > MAX_BOUNDARY_POINTS) return undefined;
  return { type: geojson.type, coordinates: geojson.coordinates } as LocationBoundary;
}

function countPositions(coordinates: unknown): number {
  if (!Array.isArray(coordinates)) return 0;
  if (typeof coordinates[0] === 'number') return 1;
  return (coordinates as unknown[]).reduce<number>((sum, part) => sum + countPositions(part), 0);
}
