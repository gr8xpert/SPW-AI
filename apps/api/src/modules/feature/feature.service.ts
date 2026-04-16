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

  async findAll(tenantId: number, category?: FeatureCategory): Promise<Feature[]> {
    const where: any = { tenantId, isActive: true };
    if (category) {
      where.category = category;
    }
    return this.featureRepository.find({
      where,
      order: { category: 'ASC', sortOrder: 'ASC', id: 'ASC' },
    });
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
}
