import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Label } from '../../database/entities';
import { CreateLabelDto, UpdateLabelDto } from './dto';
import { DEFAULT_LABELS } from './default-labels';

@Injectable()
export class LabelService {
  constructor(
    @InjectRepository(Label)
    private labelRepository: Repository<Label>,
  ) {}

  async findAll(tenantId: number): Promise<Label[]> {
    return this.labelRepository.find({
      where: { tenantId },
      order: { key: 'ASC' },
    });
  }

  async findByKey(tenantId: number, key: string): Promise<Label | null> {
    return this.labelRepository.findOne({ where: { tenantId, key } });
  }

  async findOne(tenantId: number, id: number): Promise<Label> {
    const label = await this.labelRepository.findOne({ where: { id, tenantId } });
    if (!label) {
      throw new NotFoundException('Label not found');
    }
    return label;
  }

  async create(tenantId: number, dto: CreateLabelDto): Promise<Label> {
    const existing = await this.findByKey(tenantId, dto.key);
    if (existing) {
      throw new ConflictException('Label with this key already exists');
    }
    const label = this.labelRepository.create({ ...dto, tenantId, isCustom: true });
    return this.labelRepository.save(label);
  }

  async update(tenantId: number, id: number, dto: UpdateLabelDto): Promise<Label> {
    const label = await this.findOne(tenantId, id);
    if (dto.translations) {
      label.translations = { ...label.translations, ...dto.translations };
    }
    return this.labelRepository.save(label);
  }

  async remove(tenantId: number, id: number): Promise<void> {
    const label = await this.findOne(tenantId, id);
    if (!label.isCustom) {
      throw new ConflictException('Cannot delete default labels');
    }
    await this.labelRepository.remove(label);
  }

  async initializeDefaultLabels(tenantId: number): Promise<void> {
    const existingLabels = await this.findAll(tenantId);
    const existingKeys = new Set(existingLabels.map((l) => l.key));
    const defaultKeys = new Set(DEFAULT_LABELS.map((dl) => dl.key));

    const labelsToCreate = DEFAULT_LABELS
      .filter((dl) => !existingKeys.has(dl.key))
      .map((dl) => this.labelRepository.create({ tenantId, key: dl.key, translations: dl.translations, isCustom: false }));
    if (labelsToCreate.length > 0) {
      await this.labelRepository.save(labelsToCreate);
    }

    const staleLabels = existingLabels.filter((l) => !l.isCustom && !defaultKeys.has(l.key));
    if (staleLabels.length > 0) {
      await this.labelRepository.remove(staleLabels);
    }
  }

  async getLabelsForWidget(tenantId: number, language = 'en'): Promise<Record<string, string>> {
    const labels = await this.findAll(tenantId);
    return labels.reduce((acc, label) => {
      acc[label.key] = label.translations[language] || label.translations['en'] || '';
      return acc;
    }, {} as Record<string, string>);
  }
}
