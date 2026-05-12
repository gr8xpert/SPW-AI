import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feature, FeatureCategory } from '../../database/entities';
import { CreateFeatureDto, UpdateFeatureDto } from './dto';

@Injectable()
export class FeatureService {
  constructor(
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
  ) {}

  async findAll(tenantId: number, category?: FeatureCategory): Promise<Array<Feature & { propertyCount: number }>> {
    const where: any = { tenantId, isActive: true };
    if (category) where.category = category;
    const features = await this.featureRepository.find({
      where,
      order: { category: 'ASC', sortOrder: 'ASC', id: 'ASC' },
    });

    if (features.length === 0) return [];

    // Compute property count per feature by scanning each property's JSON features array in JS.
    // Avoids JSON_CONTAINS (not portable across MySQL versions/modes) and runs in one query.
    const rows: Array<{ features: string | number[] | null }> = await this.featureRepository.manager.query(
      `SELECT features FROM properties WHERE tenantId = ? AND features IS NOT NULL`,
      [tenantId],
    );

    const countMap = new Map<number, number>();
    for (const row of rows) {
      let ids: any = row.features;
      if (typeof ids === 'string') {
        try { ids = JSON.parse(ids); } catch { ids = null; }
      }
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        const n = Number(id);
        if (Number.isFinite(n)) countMap.set(n, (countMap.get(n) || 0) + 1);
      }
    }

    return features.map((f) => ({ ...f, propertyCount: countMap.get(f.id) || 0 }));
  }

  async findByIds(tenantId: number, ids: number[]): Promise<Feature[]> {
    if (!ids.length) return [];
    return this.featureRepository
      .createQueryBuilder('f')
      .where('f.tenantId = :tenantId', { tenantId })
      .andWhere('f.id IN (:...ids)', { ids })
      .getMany();
  }

  async findOne(tenantId: number, id: number): Promise<Feature> {
    const feature = await this.featureRepository.findOne({
      where: { id, tenantId },
    });
    if (!feature) {
      throw new NotFoundException('Feature not found');
    }
    return feature;
  }

  async create(tenantId: number, dto: CreateFeatureDto): Promise<Feature> {
    const feature = this.featureRepository.create({ ...dto, tenantId });
    return this.featureRepository.save(feature);
  }

  async update(tenantId: number, id: number, dto: UpdateFeatureDto): Promise<Feature> {
    const feature = await this.findOne(tenantId, id);
    Object.assign(feature, dto);
    return this.featureRepository.save(feature);
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const feature = await this.findOne(tenantId, id);
    await this.featureRepository.remove(feature);
  }

  async bulkDelete(tenantId: number, ids: number[]): Promise<{ count: number }> {
    if (!ids.length) return { count: 0 };
    await this.featureRepository
      .createQueryBuilder()
      .delete()
      .where('tenantId = :tenantId', { tenantId })
      .andWhere('id IN (:...ids)', { ids })
      .execute();
    return { count: ids.length };
  }
}
