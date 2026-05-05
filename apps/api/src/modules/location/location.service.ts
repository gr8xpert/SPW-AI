import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location, LocationLevel } from '../../database/entities';
import { CreateLocationDto, UpdateLocationDto } from './dto';

export interface LocationTree extends Location {
  children: LocationTree[];
}

@Injectable()
export class LocationService {
  constructor(
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
  ) {}

  async findAll(tenantId: number, level?: LocationLevel): Promise<Location[]> {
    const where: any = { tenantId, isActive: true };
    if (level) {
      where.level = level;
    }
    return this.locationRepository.find({
      where,
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  async findTree(tenantId: number, includeInactive = false): Promise<LocationTree[]> {
    const where: any = { tenantId };
    if (!includeInactive) where.isActive = true;
    const locations = await this.locationRepository.find({
      where,
      order: { sortOrder: 'ASC' },
    });
    return this.buildTree(locations);
  }

  private buildTree(locations: Location[], parentId: number | null = null): LocationTree[] {
    return locations
      .filter((loc) => loc.parentId === parentId)
      .map((loc) => ({
        ...loc,
        children: this.buildTree(locations, loc.id),
      }));
  }

  async findOne(tenantId: number, id: number): Promise<Location> {
    const location = await this.locationRepository.findOne({
      where: { id, tenantId },
      relations: ['parent', 'children'],
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }

  async create(tenantId: number, dto: CreateLocationDto): Promise<Location> {
    const existing = await this.locationRepository.findOne({
      where: { tenantId, slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Location with this slug already exists');
    }
    if (dto.parentId) {
      const parent = await this.locationRepository.findOne({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException('Parent location not found');
      }
    }
    const location = this.locationRepository.create({ ...dto, tenantId });
    return this.locationRepository.save(location);
  }

  async update(tenantId: number, id: number, dto: UpdateLocationDto): Promise<Location> {
    const location = await this.findOne(tenantId, id);
    if (dto.slug && dto.slug !== location.slug) {
      const existing = await this.locationRepository.findOne({
        where: { tenantId, slug: dto.slug },
      });
      if (existing) {
        throw new ConflictException('Location with this slug already exists');
      }
    }
    if (dto.parentId === id) {
      throw new ConflictException('Location cannot be its own parent');
    }
    Object.assign(location, dto);
    return this.locationRepository.save(location);
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const location = await this.findOne(tenantId, id);
    await this.locationRepository.update({ parentId: id }, { parentId: null });
    await this.locationRepository.remove(location);
  }

  async incrementPropertyCount(tenantId: number, locationId: number): Promise<void> {
    await this.locationRepository.increment({ id: locationId, tenantId }, 'propertyCount', 1);
  }

  async decrementPropertyCount(tenantId: number, locationId: number): Promise<void> {
    await this.locationRepository.decrement({ id: locationId, tenantId }, 'propertyCount', 1);
  }
}
