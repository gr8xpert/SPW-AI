import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Label } from '../../database/entities';
import { CreateLabelDto, UpdateLabelDto } from './dto';
import { DEFAULT_LABELS, PREVIOUS_DEFAULTS } from './default-labels';

function isPreviousDefault(key: string, lang: string, text: string): boolean {
  return !!PREVIOUS_DEFAULTS[key]?.[lang]?.includes(text);
}

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

    // A default the client never changed follows a new default wording, so
    // the Labels page shows what the site shows.
    const byKey = new Map(DEFAULT_LABELS.map((dl) => [dl.key, dl]));
    const upgraded = existingLabels.filter((l) => {
      const dl = byKey.get(l.key);
      if (!dl || l.isCustom) return false;
      let changed = false;
      const next = { ...l.translations };
      for (const [lang, text] of Object.entries(l.translations || {})) {
        if (dl.translations[lang] && isPreviousDefault(l.key, lang, text)) {
          next[lang] = dl.translations[lang];
          changed = true;
        }
      }
      if (changed) l.translations = next;
      return changed;
    });
    if (upgraded.length > 0) {
      await this.labelRepository.save(upgraded);
    }
  }

  // Every default, in the page's language, with the client's own labels on
  // top. A client who never opened the Labels page has no rows at all, and
  // used to get nothing — the site then showed the widget's built-in words.
  async getLabelsForWidget(tenantId: number, language = 'en'): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const dl of DEFAULT_LABELS) {
      out[dl.key] = dl.translations[language] || dl.translations['en'] || '';
    }
    const labels = await this.findAll(tenantId);
    for (const label of labels) {
      const text = label.translations[language] || (language === 'en' ? '' : label.translations['en']) || '';
      if (!text || isPreviousDefault(label.key, language, text)) continue;
      out[label.key] = text;
    }
    return out;
  }
}
