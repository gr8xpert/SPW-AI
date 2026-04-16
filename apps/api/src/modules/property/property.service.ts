import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Property } from '../../database/entities';
import { CreatePropertyDto, UpdatePropertyDto, SearchPropertyDto, ListPropertyDto } from './dto';
import { PropertySearchService, SearchResult } from './property-search.service';
import { LocationService } from '../location/location.service';

@Injectable()
export class PropertyService {
  constructor(
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    private searchService: PropertySearchService,
    private locationService: LocationService,
  ) {}

  async search(tenantId: number, dto: SearchPropertyDto): Promise<SearchResult> {
    return this.searchService.search(tenantId, dto);
  }

  async findAll(tenantId: number): Promise<Property[]> {
    return this.propertyRepository.find({
      where: { tenantId },
      relations: ['location', 'propertyType'],
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(tenantId: number, dto: ListPropertyDto): Promise<SearchResult> {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const sortBy = dto.sortBy || 'createdAt';
    const sortOrder = dto.sortOrder || 'DESC';

    const query = this.propertyRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.location', 'location')
      .leftJoinAndSelect('p.propertyType', 'propertyType')
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
      relations: ['location', 'propertyType'],
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  async findByReference(tenantId: number, reference: string): Promise<Property | null> {
    return this.propertyRepository.findOne({
      where: { tenantId, reference },
      relations: ['location', 'propertyType'],
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
    return saved;
  }

  async update(tenantId: number, id: number, dto: UpdatePropertyDto): Promise<Property> {
    const property = await this.findOne(tenantId, id);
    const oldLocationId = property.locationId;

    if (dto.reference && dto.reference !== property.reference) {
      const existing = await this.propertyRepository.findOne({ where: { tenantId, reference: dto.reference } });
      if (existing) throw new ConflictException('Property with this reference already exists');
    }

    const updateData = this.filterLockedFields(property, dto);
    Object.assign(property, updateData);

    if (dto.isPublished && !property.publishedAt) {
      property.publishedAt = new Date();
    }

    const saved = await this.propertyRepository.save(property);

    if (dto.locationId !== undefined && dto.locationId !== oldLocationId) {
      if (oldLocationId) await this.locationService.decrementPropertyCount(tenantId, oldLocationId);
      if (dto.locationId) await this.locationService.incrementPropertyCount(tenantId, dto.locationId);
    }
    return saved;
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const property = await this.findOne(tenantId, id);
    if (property.locationId) {
      await this.locationService.decrementPropertyCount(tenantId, property.locationId);
    }
    await this.propertyRepository.remove(property);
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
