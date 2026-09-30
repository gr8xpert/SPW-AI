import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Property, Location, PropertyType, LocationBoundary } from '../../database/entities';
import { SearchPropertyDto } from './dto';
import { fenceFor, resolveLocationPoints } from '../location/location-points';

// Where a listing is for map and area searches: its own GPS, else its
// location's point (filled from the location template). Feeds such as Resales
// send no GPS, so without the fallback those listings could never be found by
// area. Every query using these must join `p.location` as `location`.
const GEO_LAT = 'COALESCE(p.lat, location.lat)';
const GEO_LNG = 'COALESCE(p.lng, location.lng)';
const MAP_POINT_LIMIT = 3000;

export interface MapPoint {
  id: number;
  reference: string;
  title: Record<string, string> | string;
  price: number | null;
  currency: string;
  priceOnRequest: boolean;
  listingType: string;
  bedrooms: number | null;
  bathrooms: number | null;
  buildSize: number | null;
  lat: number;
  lng: number;
  // True when the point is the location's, not the listing's own GPS.
  approximate: boolean;
  location: { id: number; name: Record<string, string> | string } | null;
  propertyType: { name: Record<string, string> | string } | null;
  slug: string | null;
  image: string | null;
}

export interface SearchResult {
  data: Property[];
  meta: { total: number; page: number; limit: number; pages: number; };
}

@Injectable()
export class PropertySearchService {
  constructor(
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
  ) {}

  async search(tenantId: number, dto: SearchPropertyDto): Promise<SearchResult> {
    const query = this.propertyRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.location', 'location')
      .leftJoinAndSelect('p.propertyType', 'propertyType')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true });

    await this.applyFilters(query, dto, tenantId);
    this.applySorting(query, dto.sortBy);

    const total = await query.getCount();
    const page = dto.page || 1;
    const limit = dto.limit || 20;

    const data = await query.skip((page - 1) * limit).take(limit).getMany();

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // Every matching listing as a light map point (no pagination, capped), so the
  // map shows all results instead of the current page. Same filters as search.
  async mapPoints(tenantId: number, dto: SearchPropertyDto): Promise<{ data: MapPoint[]; meta: { total: number; truncated: boolean } }> {
    const query = this.propertyRepository
      .createQueryBuilder('p')
      .leftJoin('p.location', 'location')
      .leftJoin('p.propertyType', 'propertyType')
      .select([
        'p.id', 'p.reference', 'p.title', 'p.slug', 'p.price', 'p.currency', 'p.priceOnRequest', 'p.listingType',
        'p.bedrooms', 'p.bathrooms', 'p.buildSize', 'p.lat', 'p.lng', 'p.images',
        'location.id', 'location.name', 'location.lat', 'location.lng', 'propertyType.id', 'propertyType.name',
      ])
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true })
      .andWhere(`${GEO_LAT} IS NOT NULL`)
      .andWhere(`${GEO_LNG} IS NOT NULL`);
    await this.applyFilters(query, dto, tenantId);
    query.orderBy('p.id', 'ASC');
    const rows = await query.take(MAP_POINT_LIMIT + 1).getMany();
    const truncated = rows.length > MAP_POINT_LIMIT;

    // Where each place may actually be drawn. A listing with no GPS of its own
    // borrows its place's point, so one bad row would otherwise put every
    // listing in that place on the wrong continent — whatever is in the table,
    // and whether or not anyone has run the location fixer.
    const places = await this.locationRepository.find({
      where: { tenantId },
      select: ['id', 'parentId', 'level', 'lat', 'lng'],
    });
    const points = resolveLocationPoints(places);

    const data = rows.slice(0, MAP_POINT_LIMIT).map((p): MapPoint | null => {
      const own = p.lat != null && p.lng != null;
      // No believable point for this listing's place: leave it off the map
      // rather than draw it somewhere it is not.
      const borrowed = own ? null : (p.location ? points.get(p.location.id) : undefined);
      if (!own && !borrowed) return null;
      const images = Array.isArray(p.images) ? [...p.images].sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0)) : [];
      const first: any = images[0];
      return {
        id: p.id,
        reference: p.reference,
        title: p.title as any,
        price: p.price != null ? Number(p.price) : null,
        currency: p.currency,
        priceOnRequest: !!p.priceOnRequest,
        listingType: p.listingType,
        bedrooms: p.bedrooms ?? null,
        bathrooms: p.bathrooms ?? null,
        buildSize: p.buildSize != null ? Number(p.buildSize) : null,
        lat: own ? Number(p.lat) : borrowed!.lat,
        lng: own ? Number(p.lng) : borrowed!.lng,
        approximate: !own,
        location: p.location ? { id: p.location.id, name: p.location.name as any } : null,
        propertyType: p.propertyType ? { name: p.propertyType.name as any } : null,
        slug: p.slug ?? null,
        image: first ? first.thumbnailUrl || first.url || null : null,
      };
    }).filter((point): point is MapPoint => point !== null);
    return { data, meta: { total: data.length, truncated } };
  }

  // Returns up to `limit` properties that share location and/or property type
  // with the given reference (active + published only). Self is excluded.
  // Used by the widget's "Similar properties" carousel on the detail page.
  async findSimilar(
    tenantId: number,
    reference: string,
    limit: number,
  ): Promise<Property[]> {
    const source = await this.propertyRepository.findOne({
      where: { tenantId, reference },
      select: ['id', 'locationId', 'propertyTypeId', 'price'],
    });
    if (!source) return [];

    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const qb = this.propertyRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.location', 'location')
      .leftJoinAndSelect('p.propertyType', 'propertyType')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.id != :id', { id: source.id })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true });

    if (source.locationId || source.propertyTypeId) {
      qb.andWhere('(p.locationId = :locationId OR p.propertyTypeId = :propertyTypeId)', {
        locationId: source.locationId,
        propertyTypeId: source.propertyTypeId,
      });
    }
    // TypeORM 0.3's addOrderBy rejects expression form ("ABS(p.price - :x)")
    // as an unknown alias, so we over-fetch by createdAt and sort by price
    // proximity in JS. Cap the candidate pool so we don't pull the whole table.
    qb.addOrderBy('p.createdAt', 'DESC');
    const candidatePool = Math.min(safeLimit * 5, 200);
    const candidates = await qb.take(candidatePool).getMany();

    const basePrice = source.price != null ? Number(source.price) : null;
    if (basePrice != null && Number.isFinite(basePrice)) {
      candidates.sort((a, b) => {
        const ap = a.price != null ? Number(a.price) : Number.POSITIVE_INFINITY;
        const bp = b.price != null ? Number(b.price) : Number.POSITIVE_INFINITY;
        return Math.abs(ap - basePrice) - Math.abs(bp - basePrice);
      });
    }
    return candidates.slice(0, safeLimit);
  }

  // Expands a selected parent id (location or type) to itself + all descendants.
  // Used so picking "Marbella" returns properties in every child town/area.
  private async expandDescendants(
    tenantId: number,
    rootId: number,
    table: 'locations' | 'property_types',
  ): Promise<number[]> {
    const rows: Array<{ id: number; parentId: number | null }> = await this.propertyRepository.manager.query(
      `SELECT id, parentId FROM ${table} WHERE tenantId = ?`,
      [tenantId],
    );
    const childrenOf = new Map<number, number[]>();
    for (const r of rows) {
      if (r.parentId != null) {
        const arr = childrenOf.get(Number(r.parentId)) || [];
        arr.push(Number(r.id));
        childrenOf.set(Number(r.parentId), arr);
      }
    }
    const result = new Set<number>([rootId]);
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const child of childrenOf.get(id) || []) {
        if (!result.has(child)) {
          result.add(child);
          stack.push(child);
        }
      }
    }
    return [...result];
  }

  private async applyFilters(query: SelectQueryBuilder<Property>, dto: SearchPropertyDto, tenantId: number): Promise<void> {
    if (dto.reference) {
      query.andWhere('p.reference = :reference', { reference: dto.reference });
    }
    if (dto.ids?.length) {
      query.andWhere('p.id IN (:...ids)', { ids: dto.ids });
    }
    // Multi-location: union of expanded subtrees so picking several cities
    // returns properties across all of them.
    if (dto.locationIds?.length) {
      const all = new Set<number>();
      for (const id of dto.locationIds) {
        for (const expanded of await this.expandDescendants(tenantId, id, 'locations')) {
          all.add(expanded);
        }
      }
      if (all.size > 0) {
        query.andWhere('p.locationId IN (:...locationIdsExpanded)', {
          locationIdsExpanded: [...all],
        });
      }
    } else if (dto.locationId) {
      const ids = await this.expandDescendants(tenantId, dto.locationId, 'locations');
      query.andWhere('p.locationId IN (:...locationIds)', { locationIds: ids });
    }
    // Several types (the search form's multi-select) or one; each with its
    // sub-types, like locations.
    const typeRoots = dto.propertyTypeIds?.length ? dto.propertyTypeIds : dto.propertyTypeId ? [dto.propertyTypeId] : [];
    if (typeRoots.length) {
      const all = new Set<number>();
      for (const id of typeRoots) {
        for (const expanded of await this.expandDescendants(tenantId, id, 'property_types')) all.add(expanded);
      }
      if (all.size > 0) query.andWhere('p.propertyTypeId IN (:...typeIds)', { typeIds: [...all] });
    }
    // Geo filters. `bounds` (SW/NE box) takes priority over lat/lng/radius
    // because the map drag-to-search is the more deliberate query shape.
    if (dto.bounds) {
      const parts = dto.bounds.split(',').map((s) => Number(s.trim()));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [swLat, swLng, neLat, neLng] = parts;
        query.andWhere(`${GEO_LAT} BETWEEN :swLat AND :neLat`, { swLat, neLat });
        // Crosses-antimeridian bounding boxes are pathological — we treat
        // them as an empty result rather than wrapping; the widget doesn't
        // emit those.
        query.andWhere(`${GEO_LNG} BETWEEN :swLng AND :neLng`, { swLng, neLng });
      }
    } else if (dto.lat !== undefined && dto.lng !== undefined && dto.radius) {
      // Haversine in km. ratio = degrees per km at the search latitude
      // (latitude ~111km/deg; longitude shrinks by cos(lat)). Good enough
      // for property search radii without a spatial index.
      query.andWhere(
        '(' +
          '6371 * 2 * ASIN(SQRT(' +
          `POWER(SIN(RADIANS(${GEO_LAT} - :lat) / 2), 2) + ` +
          `COS(RADIANS(:lat)) * COS(RADIANS(${GEO_LAT})) * ` +
          `POWER(SIN(RADIANS(${GEO_LNG} - :lng) / 2), 2)` +
          ')) <= :radius)',
        { lat: dto.lat, lng: dto.lng, radius: dto.radius },
      );
    }
    if (dto.listingType) query.andWhere('p.listingType = :listingType', { listingType: dto.listingType });
    if (dto.minPrice !== undefined) query.andWhere('p.price >= :minPrice', { minPrice: dto.minPrice });
    if (dto.maxPrice !== undefined) query.andWhere('p.price <= :maxPrice', { maxPrice: dto.maxPrice });
    if (dto.minBedrooms !== undefined) query.andWhere('p.bedrooms >= :minBeds', { minBeds: dto.minBedrooms });
    if (dto.maxBedrooms !== undefined) query.andWhere('p.bedrooms <= :maxBeds', { maxBeds: dto.maxBedrooms });
    if (dto.minBathrooms !== undefined) query.andWhere('p.bathrooms >= :minBaths', { minBaths: dto.minBathrooms });
    if (dto.maxBathrooms !== undefined) query.andWhere('p.bathrooms <= :maxBaths', { maxBaths: dto.maxBathrooms });
    if (dto.minBuildSize !== undefined) query.andWhere('p.buildSize >= :minBuild', { minBuild: dto.minBuildSize });
    if (dto.maxBuildSize !== undefined) query.andWhere('p.buildSize <= :maxBuild', { maxBuild: dto.maxBuildSize });
    if (dto.minPlotSize !== undefined) query.andWhere('p.plotSize >= :minPlot', { minPlot: dto.minPlotSize });
    if (dto.maxPlotSize !== undefined) query.andWhere('p.plotSize <= :maxPlot', { maxPlot: dto.maxPlotSize });
    if (dto.minTerraceSize !== undefined) query.andWhere('p.terraceSize >= :minTerrace', { minTerrace: dto.minTerraceSize });
    if (dto.maxTerraceSize !== undefined) query.andWhere('p.terraceSize <= :maxTerrace', { maxTerrace: dto.maxTerraceSize });
    if (dto.minSolariumSize !== undefined) query.andWhere('p.solariumSize >= :minSol', { minSol: dto.minSolariumSize });
    if (dto.maxSolariumSize !== undefined) query.andWhere('p.solariumSize <= :maxSol', { maxSol: dto.maxSolariumSize });
    if (dto.features?.length) {
      dto.features.forEach((featureId, index) => {
        query.andWhere(`JSON_CONTAINS(p.features, :feature${index})`, { [`feature${index}`]: JSON.stringify(featureId) });
      });
    }
    if (dto.isFeatured !== undefined) query.andWhere('p.isFeatured = :isFeatured', { isFeatured: dto.isFeatured });
    if (dto.isOwnProperty !== undefined) query.andWhere('p.isOwnProperty = :isOwnProperty', { isOwnProperty: dto.isOwnProperty });
  }

  /**
   * The places a search covers, with how many listings are in each and the
   * outline of the place itself.
   *
   * Feed listings arrive with no coordinates, so a pin map can only ever put
   * every listing in a town on one dot. This answers the question the data can
   * actually support — "where are they, roughly, and how many" — and the map
   * draws the town rather than inventing an address.
   */
  async areas(tenantId: number, dto: SearchPropertyDto): Promise<{
    data: Array<{
      id: number;
      name: unknown;
      level: string;
      count: number;
      lat: number;
      lng: number;
      boundary: LocationBoundary | null;
      fence: LocationBoundary | null;
    }>;
  }> {
    const query = this.propertyRepository
      .createQueryBuilder('p')
      .leftJoin('p.location', 'location')
      .select('location.id', 'locationId')
      .addSelect('COUNT(*)', 'count')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true })
      .andWhere('location.id IS NOT NULL')
      .groupBy('location.id');
    await this.applyFilters(query, dto, tenantId);

    const grouped = await query.getRawMany<{ locationId: number; count: string }>();
    if (!grouped.length) return { data: [] };

    // `boundary` is hidden on the entity (it is a few hundred coordinate pairs
    // per place), so it has to be asked for by name.
    const places = await this.locationRepository
      .createQueryBuilder('l')
      .select(['l.id', 'l.parentId', 'l.level', 'l.name', 'l.lat', 'l.lng'])
      .addSelect('l.boundary')
      .where('l.tenantId = :tenantId', { tenantId })
      .getMany();
    const points = resolveLocationPoints(places);
    const byId = new Map(places.map((l) => [l.id, l]));

    const data = grouped
      .map((row) => {
        const place = byId.get(Number(row.locationId));
        const point = points.get(Number(row.locationId));
        if (!place || !point) return null;
        return {
          id: place.id,
          name: place.name as unknown,
          level: place.level as string,
          count: Number(row.count),
          lat: point.lat,
          lng: point.lng,
          // Only the place's own outline: a borrowed point means we are not
          // sure enough of the place to draw its shape.
          boundary: point.borrowed ? null : (place.boundary ?? null),
          // Where its listings may be drawn. A town with no shape of its own
          // borrows its municipality's, whose boundary follows the coastline —
          // which is what keeps a listing out of the sea.
          fence: fenceFor(place, byId),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.count - a.count);

    return { data };
  }

  private applySorting(query: SelectQueryBuilder<Property>, sortBy?: string): void {
    switch (sortBy) {
      case 'create_date_desc': query.addOrderBy('p.createdAt', 'DESC'); break;
      case 'create_date': query.addOrderBy('p.createdAt', 'ASC'); break;
      case 'write_date_desc': query.addOrderBy('p.updatedAt', 'DESC'); break;
      case 'write_date': query.addOrderBy('p.updatedAt', 'ASC'); break;
      // TypeORM's third-arg `NULLS LAST` is Postgres-only and produces invalid
      // MySQL SQL. MySQL sorts NULLs last for DESC and first for ASC by default;
      // acceptable for a price sort.
      case 'list_price': query.addOrderBy('p.price', 'ASC'); break;
      case 'list_price_desc': query.addOrderBy('p.price', 'DESC'); break;
      case 'is_featured_desc': query.addOrderBy('p.isFeatured', 'DESC'); break;
      // The agency's own listings first, then everything else newest-first, so
      // the tail of the list is still in a sensible order.
      case 'own_first':
        query.addOrderBy('p.isOwnProperty', 'DESC');
        query.addOrderBy('p.createdAt', 'DESC');
        break;
      case 'location_id': query.addOrderBy('p.locationId', 'ASC'); break;
      default: query.addOrderBy('p.createdAt', 'DESC');
    }
  }
}
