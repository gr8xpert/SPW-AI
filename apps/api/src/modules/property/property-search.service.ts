import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Property, Location, PropertyType } from '../../database/entities';
import { SearchPropertyDto } from './dto';

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
    // Sort by price proximity when available — visually closer to the source
    // listing than raw createdAt order.
    if (source.price != null) {
      qb.addOrderBy('ABS(p.price - :basePrice)', 'ASC').setParameter('basePrice', source.price);
    } else {
      qb.addOrderBy('p.createdAt', 'DESC');
    }

    return qb.take(safeLimit).getMany();
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
    if (dto.propertyTypeId) {
      const ids = await this.expandDescendants(tenantId, dto.propertyTypeId, 'property_types');
      query.andWhere('p.propertyTypeId IN (:...typeIds)', { typeIds: ids });
    }
    // Geo filters. `bounds` (SW/NE box) takes priority over lat/lng/radius
    // because the map drag-to-search is the more deliberate query shape.
    if (dto.bounds) {
      const parts = dto.bounds.split(',').map((s) => Number(s.trim()));
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        const [swLat, swLng, neLat, neLng] = parts;
        query.andWhere('p.lat BETWEEN :swLat AND :neLat', { swLat, neLat });
        // Crosses-antimeridian bounding boxes are pathological — we treat
        // them as an empty result rather than wrapping; the widget doesn't
        // emit those.
        query.andWhere('p.lng BETWEEN :swLng AND :neLng', { swLng, neLng });
      }
    } else if (dto.lat !== undefined && dto.lng !== undefined && dto.radius) {
      // Haversine in km. ratio = degrees per km at the search latitude
      // (latitude ~111km/deg; longitude shrinks by cos(lat)). Good enough
      // for property search radii without a spatial index.
      query.andWhere(
        '(' +
          '6371 * 2 * ASIN(SQRT(' +
          'POWER(SIN(RADIANS(p.lat - :lat) / 2), 2) + ' +
          'COS(RADIANS(:lat)) * COS(RADIANS(p.lat)) * ' +
          'POWER(SIN(RADIANS(p.lng - :lng) / 2), 2)' +
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
  }

  private applySorting(query: SelectQueryBuilder<Property>, sortBy?: string): void {
    switch (sortBy) {
      case 'create_date_desc': query.addOrderBy('p.createdAt', 'DESC'); break;
      case 'create_date': query.addOrderBy('p.createdAt', 'ASC'); break;
      case 'write_date_desc': query.addOrderBy('p.updatedAt', 'DESC'); break;
      case 'write_date': query.addOrderBy('p.updatedAt', 'ASC'); break;
      case 'list_price': query.addOrderBy('p.price', 'ASC', 'NULLS LAST'); break;
      case 'list_price_desc': query.addOrderBy('p.price', 'DESC', 'NULLS LAST'); break;
      case 'is_featured_desc': query.addOrderBy('p.isFeatured', 'DESC'); break;
      case 'location_id': query.addOrderBy('p.locationId', 'ASC'); break;
      default: query.addOrderBy('p.createdAt', 'DESC');
    }
  }
}
