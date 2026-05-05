import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Property } from '../../database/entities';
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
  ) {}

  async search(tenantId: number, dto: SearchPropertyDto): Promise<SearchResult> {
    const query = this.propertyRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.location', 'location')
      .leftJoinAndSelect('p.propertyType', 'propertyType')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.status = :status', { status: 'active' })
      .andWhere('p.isPublished = :published', { published: true });

    this.applyFilters(query, dto);
    this.applySorting(query, dto.sortBy);

    const total = await query.getCount();
    const page = dto.page || 1;
    const limit = dto.limit || 20;

    const data = await query.skip((page - 1) * limit).take(limit).getMany();

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  private applyFilters(query: SelectQueryBuilder<Property>, dto: SearchPropertyDto): void {
    if (dto.locationId) query.andWhere('p.locationId = :locationId', { locationId: dto.locationId });
    if (dto.propertyTypeId) query.andWhere('p.propertyTypeId = :typeId', { typeId: dto.propertyTypeId });
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
