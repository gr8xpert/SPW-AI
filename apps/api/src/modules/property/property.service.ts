import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../../database/entities';
import { CreatePropertyDto, UpdatePropertyDto, SearchPropertyDto, ListPropertyDto } from './dto';
import { PropertySearchService, SearchResult } from './property-search.service';
import { LocationService } from '../location/location.service';
import { TenantService } from '../tenant/tenant.service';
import { WebhookService } from '../webhook/webhook.service';

@Injectable()
export class PropertyService {
  private readonly logger = new Logger(PropertyService.name);

  constructor(
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    private searchService: PropertySearchService,
    private locationService: LocationService,
    private tenantService: TenantService,
    private webhookService: WebhookService,
  ) {}

  // Webhook emits are best-effort: a failed emit must not roll back the
  // primary write. The service records a 'skipped'/'failed' row in either
  // case, so the outcome is still observable from the dashboard.
  //
  // Each property.* event also bumps tenant.syncVersion. Without this,
  // polling-only widgets (/sync-meta tick) would never notice a property
  // change until the operator clicked "Clear cache" — defeating the whole
  // poll mechanism. The post-bump version is stamped into the payload so
  // webhook receivers (WP plugin, others) can de-dupe retries and log a
  // consistent version when investigating.
  private async emit(
    tenantId: number,
    event: 'property.created' | 'property.updated' | 'property.deleted',
    property: Property,
  ): Promise<void> {
    let syncVersion: number | undefined;
    try {
      syncVersion = await this.tenantService.incrementAndGetSyncVersion(tenantId);
    } catch (err) {
      this.logger.warn(
        `syncVersion bump failed for ${event} property=${property.id}: ${
          (err as Error).message
        }`,
      );
    }

    try {
      await this.webhookService.emit(tenantId, event, {
        id: property.id,
        reference: property.reference,
        status: property.status,
        isPublished: property.isPublished,
        listingType: property.listingType,
        price: property.price,
        currency: property.currency,
        // Omitted when the bump failed so the receiver doesn't get a stale
        // version that would mistakenly mark it "up-to-date".
        ...(syncVersion !== undefined ? { syncVersion } : {}),
      });
    } catch (err) {
      this.logger.warn(
        `webhook emit for ${event} property=${property.id} failed: ${(err as Error).message}`,
      );
    }
  }

  async search(tenantId: number, dto: SearchPropertyDto): Promise<SearchResult> {
    return this.searchService.search(tenantId, dto);
  }

  private readonly defaultRelations = ['location', 'propertyType', 'agent', 'salesAgent', 'lastUpdatedByUser'];

  async findAll(tenantId: number): Promise<Property[]> {
    return this.propertyRepository.find({
      where: { tenantId },
      relations: this.defaultRelations,
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(tenantId: number, dto: ListPropertyDto): Promise<SearchResult> {
    const page = dto.page || 1;
    const limit = dto.limit || 50;
    const sortBy = dto.sortBy || 'createdAt';
    const sortOrder = dto.sortOrder || 'DESC';

    const query = this.propertyRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.location', 'location')
      .leftJoinAndSelect('p.propertyType', 'propertyType')
      .leftJoinAndSelect('p.agent', 'agent')
      .leftJoinAndSelect('p.salesAgent', 'salesAgent')
      .leftJoinAndSelect('p.lastUpdatedByUser', 'lastUpdatedByUser')
      .where('p.tenantId = :tenantId', { tenantId });

    if (dto.search) {
      query.andWhere(
        '(p.reference LIKE :search OR CAST(p.title AS CHAR) LIKE :search)',
        { search: `%${dto.search}%` }
      );
    }

    if (dto.status) {
      query.andWhere('p.status = :status', { status: dto.status });
    }

    if (dto.source) {
      query.andWhere('p.source = :source', { source: dto.source });
    }

    if (dto.listingType) {
      query.andWhere('p.listingType = :listingType', { listingType: dto.listingType });
    }

    if (dto.propertyTypeId !== undefined) {
      query.andWhere('p.propertyTypeId = :propertyTypeId', { propertyTypeId: dto.propertyTypeId });
    }

    if (dto.isFeatured !== undefined) {
      query.andWhere('p.isFeatured = :isFeatured', { isFeatured: dto.isFeatured });
    }

    if (dto.isOwnProperty !== undefined) {
      query.andWhere('p.isOwnProperty = :isOwnProperty', { isOwnProperty: dto.isOwnProperty });
    }

    if (dto.isPublished !== undefined) {
      query.andWhere('p.isPublished = :isPublished', { isPublished: dto.isPublished });
    }

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

    query.orderBy(`p.${sortBy}`, sortOrder);

    const total = await query.getCount();
    const data = await query.skip((page - 1) * limit).take(limit).getMany();

    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: number, id: number): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id, tenantId },
      relations: this.defaultRelations,
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async findByReference(tenantId: number, reference: string): Promise<Property | null> {
    return this.propertyRepository.findOne({
      where: { tenantId, reference },
      relations: this.defaultRelations,
    });
  }

  async create(tenantId: number, dto: CreatePropertyDto): Promise<Property> {
    const existing = await this.propertyRepository.findOne({ where: { tenantId, reference: dto.reference } });
    if (existing) throw new ConflictException('Property with this reference already exists');

    const property = this.propertyRepository.create({ ...dto, tenantId, source: 'manual' });
    const saved = await this.propertyRepository.save(property);

    if (saved.locationId) {
      await this.locationService.incrementPropertyCount(tenantId, saved.locationId);
    }
    await this.emit(tenantId, 'property.created', saved);
    return saved;
  }

  async update(tenantId: number, id: number, dto: UpdatePropertyDto, userId?: number): Promise<Property> {
    const property = await this.findOne(tenantId, id);
    const oldLocationId = property.locationId;

    if (dto.reference && dto.reference !== property.reference) {
      const existing = await this.propertyRepository.findOne({ where: { tenantId, reference: dto.reference } });
      if (existing) throw new ConflictException('Property with this reference already exists');
    }

    const updateData = this.filterLockedFields(property, dto);
    Object.assign(property, updateData);

    if (userId) {
      property.lastUpdatedById = userId;
    }

    if (dto.isPublished && !property.publishedAt) {
      property.publishedAt = new Date();
    }

    const saved = await this.propertyRepository.save(property);

    if (dto.locationId !== undefined && dto.locationId !== oldLocationId) {
      if (oldLocationId) await this.locationService.decrementPropertyCount(tenantId, oldLocationId);
      if (dto.locationId) await this.locationService.incrementPropertyCount(tenantId, dto.locationId);
    }
    await this.emit(tenantId, 'property.updated', saved);
    return saved;
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const property = await this.findOne(tenantId, id);
    if (property.locationId) {
      await this.locationService.decrementPropertyCount(tenantId, property.locationId);
    }
    // Snapshot before removal so the webhook payload still carries identity.
    const snapshot = { ...property } as Property;
    await this.propertyRepository.remove(property);
    await this.emit(tenantId, 'property.deleted', snapshot);
  }

  async lockFields(tenantId: number, id: number, fields: string[]): Promise<Property> {
    const property = await this.findOne(tenantId, id);
    const currentLocked = property.lockedFields || [];
    property.lockedFields = [...new Set([...currentLocked, ...fields])];
    return this.propertyRepository.save(property);
  }

  async unlockFields(tenantId: number, id: number, fields: string[]): Promise<Property> {
    const property = await this.findOne(tenantId, id);
    property.lockedFields = (property.lockedFields || []).filter((f) => !fields.includes(f));
    return this.propertyRepository.save(property);
  }

  async markAsSold(tenantId: number, id: number): Promise<Property> {
    const property = await this.findOne(tenantId, id);
    property.status = 'sold';
    property.soldAt = new Date();
    return this.propertyRepository.save(property);
  }

  private filterLockedFields(property: Property, dto: UpdatePropertyDto): Partial<UpdatePropertyDto> {
    if (!property.lockedFields || property.lockedFields.length === 0) return dto;
    const filtered: Partial<UpdatePropertyDto> = { ...dto };
    for (const field of property.lockedFields) {
      delete filtered[field as keyof UpdatePropertyDto];
    }
    return filtered;
  }
}
