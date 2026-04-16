import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Location,
  PropertyType,
  Feature,
  LocationGroup,
  PropertyTypeGroup,
  FeatureGroup,
} from '../../database/entities';
import { ReorderDto } from './dto';

@Injectable()
export class ReorderService {
  constructor(
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    @InjectRepository(LocationGroup)
    private locationGroupRepository: Repository<LocationGroup>,
    @InjectRepository(PropertyTypeGroup)
    private propertyTypeGroupRepository: Repository<PropertyTypeGroup>,
    @InjectRepository(FeatureGroup)
    private featureGroupRepository: Repository<FeatureGroup>,
  ) {}

  /**
   * Reorder locations
   */
  async reorderLocations(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    // Verify all items belong to tenant
    const locations = await this.locationRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (locations.length !== ids.length) {
      throw new NotFoundException('Some locations not found');
    }

    // Update sort orders
    for (const item of dto.items) {
      await this.locationRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder property types
   */
  async reorderPropertyTypes(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const propertyTypes = await this.propertyTypeRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (propertyTypes.length !== ids.length) {
      throw new NotFoundException('Some property types not found');
    }

    for (const item of dto.items) {
      await this.propertyTypeRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder features
   */
  async reorderFeatures(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const features = await this.featureRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (features.length !== ids.length) {
      throw new NotFoundException('Some features not found');
    }

    for (const item of dto.items) {
      await this.featureRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder location groups
   */
  async reorderLocationGroups(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const groups = await this.locationGroupRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (groups.length !== ids.length) {
      throw new NotFoundException('Some location groups not found');
    }

    for (const item of dto.items) {
      await this.locationGroupRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder property type groups
   */
  async reorderPropertyTypeGroups(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const groups = await this.propertyTypeGroupRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (groups.length !== ids.length) {
      throw new NotFoundException('Some property type groups not found');
    }

    for (const item of dto.items) {
      await this.propertyTypeGroupRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }

  /**
   * Reorder feature groups
   */
  async reorderFeatureGroups(tenantId: number, dto: ReorderDto): Promise<{ updated: number }> {
    const ids = dto.items.map((item) => item.id);

    const groups = await this.featureGroupRepository.find({
      where: { tenantId, id: In(ids) },
    });

    if (groups.length !== ids.length) {
      throw new NotFoundException('Some feature groups not found');
    }

    for (const item of dto.items) {
      await this.featureGroupRepository.update(
        { id: item.id, tenantId },
        { sortOrder: item.sortOrder },
      );
    }

    return { updated: dto.items.length };
  }
}
