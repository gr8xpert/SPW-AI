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

  async findAll(tenantId: number): Promise<Array<PropertyType & { propertyCount: number }>> {
    const types = await this.propertyTypeRepository.find({
      where: { tenantId, isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });

    const counts: Array<{ propertyTypeId: number; cnt: string }> = await this.propertyTypeRepository.manager.query(
      `SELECT propertyTypeId, COUNT(*) AS cnt
       FROM properties
       WHERE tenantId = ? AND propertyTypeId IS NOT NULL
       GROUP BY propertyTypeId`,
      [tenantId],
    );

    const directCount = new Map<number, number>();
    for (const row of counts) directCount.set(Number(row.propertyTypeId), parseInt(row.cnt, 10));

    // Roll up: a parent's count includes all of its descendants' counts.
    const childrenOf = new Map<number, number[]>();
    for (const pt of types) {
      if (pt.parentId != null) {
        const arr = childrenOf.get(pt.parentId) || [];
        arr.push(pt.id);
        childrenOf.set(pt.parentId, arr);
      }
    }
    const rolledUp = new Map<number, number>();
    const collect = (id: number): number => {
      if (rolledUp.has(id)) return rolledUp.get(id)!;
      let total = directCount.get(id) || 0;
      for (const childId of childrenOf.get(id) || []) total += collect(childId);
      rolledUp.set(id, total);
      return total;
    };
    for (const pt of types) collect(pt.id);

    return types.map((pt) => ({ ...pt, propertyCount: rolledUp.get(pt.id) || 0 }));
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
    const existing = await this.propertyTypeRepository.findOne({
      where: { tenantId, slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Property type with this slug already exists');
    }
    if (dto.parentId) {
      const parent = await this.propertyTypeRepository.findOne({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) throw new NotFoundException('Parent property type not found');
    }

    const propertyType = this.propertyTypeRepository.create({ ...dto, tenantId });
    return this.propertyTypeRepository.save(propertyType);
  }

  async update(tenantId: number, id: number, dto: UpdatePropertyTypeDto): Promise<PropertyType> {
    const propertyType = await this.findOne(tenantId, id);

    if (dto.slug && dto.slug !== propertyType.slug) {
      const existing = await this.propertyTypeRepository.findOne({
        where: { tenantId, slug: dto.slug },
      });
      if (existing) {
        throw new ConflictException('Property type with this slug already exists');
      }
    }

    if (dto.parentId === id) {
      throw new ConflictException('Property type cannot be its own parent');
    }
    if (dto.parentId != null) {
      const parent = await this.propertyTypeRepository.findOne({
        where: { id: dto.parentId, tenantId },
      });
      if (!parent) throw new NotFoundException('Parent property type not found');
    }

    // Column-level update bypasses any stale loaded relation, same reason as in LocationService.
    const updateData: Partial<PropertyType> = {};
    for (const key of Object.keys(dto) as Array<keyof UpdatePropertyTypeDto>) {
      (updateData as any)[key] = (dto as any)[key];
    }
    await this.propertyTypeRepository.update({ id, tenantId }, updateData);
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const propertyType = await this.findOne(tenantId, id);
    await this.propertyTypeRepository.remove(propertyType);
  }

  async bulkDelete(tenantId: number, ids: number[]): Promise<{ count: number }> {
    if (!ids.length) return { count: 0 };
    await this.propertyTypeRepository
      .createQueryBuilder()
      .update()
      .set({ parentId: null })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('parentId IN (:...ids)', { ids })
      .execute();
    await this.propertyTypeRepository
      .createQueryBuilder()
      .delete()
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
    return { count: ids.length };
  }

  async bulkMove(tenantId: number, ids: number[], parentId: number | null): Promise<{ count: number }> {
    if (!ids.length) return { count: 0 };
    if (parentId != null) {
      if (ids.includes(parentId)) throw new ConflictException('A property type cannot be moved into itself');
      const parent = await this.propertyTypeRepository.findOne({ where: { id: parentId, tenantId } });
      if (!parent) throw new NotFoundException('Parent property type not found');
    }
    await this.propertyTypeRepository
      .createQueryBuilder()
      .update()
      .set({ parentId })
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
    return { count: ids.length };
  }
}
