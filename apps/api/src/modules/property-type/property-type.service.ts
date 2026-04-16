import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PropertyType } from '../../database/entities';
import { CreatePropertyTypeDto, UpdatePropertyTypeDto } from './dto';

@Injectable()
export class PropertyTypeService {
  constructor(
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
  ) {}

  async findAll(tenantId: number): Promise<PropertyType[]> {
    return this.propertyTypeRepository.find({
      where: { tenantId, isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
  }

  async findOne(tenantId: number, id: number): Promise<PropertyType> {
    const propertyType = await this.propertyTypeRepository.findOne({
      where: { id, tenantId },
    });

    if (!propertyType) {
      throw new NotFoundException('Property type not found');
    }

    return propertyType;
  }

  async create(tenantId: number, dto: CreatePropertyTypeDto): Promise<PropertyType> {
    // Check for duplicate slug
    const existing = await this.propertyTypeRepository.findOne({
      where: { tenantId, slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException('Property type with this slug already exists');
    }

    const propertyType = this.propertyTypeRepository.create({
      ...dto,
      tenantId,
    });

    return this.propertyTypeRepository.save(propertyType);
  }

  async update(tenantId: number, id: number, dto: UpdatePropertyTypeDto): Promise<PropertyType> {
    const propertyType = await this.findOne(tenantId, id);

    // Check for duplicate slug if changing
    if (dto.slug && dto.slug !== propertyType.slug) {
      const existing = await this.propertyTypeRepository.findOne({
        where: { tenantId, slug: dto.slug },
      });

      if (existing) {
        throw new ConflictException('Property type with this slug already exists');
      }
    }

    Object.assign(propertyType, dto);
    return this.propertyTypeRepository.save(propertyType);
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const propertyType = await this.findOne(tenantId, id);
    await this.propertyTypeRepository.remove(propertyType);
  }
}
