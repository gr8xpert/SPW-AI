import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job } from 'bullmq';
import { Property, PropertyType, Feature, Label } from '../../database/entities';
import { AiService, ChatMessage } from '../ai/ai.service';
import { BulkTranslateJob } from './translation.service';

@Processor('translation')
export class TranslationProcessor extends WorkerHost {
  private readonly logger = new Logger(TranslationProcessor.name);

  constructor(
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    @InjectRepository(Label)
    private labelRepository: Repository<Label>,
    private aiService: AiService,
  ) {
    super();
  }

  async process(job: Job<BulkTranslateJob>): Promise<void> {
    const { tenantId, targetLanguages, sourceLanguage, propertyIds, entityType } = job.data;
    const type = entityType || 'property';

    this.logger.log(`Bulk translate ${type}s for tenant ${tenantId} → [${targetLanguages.join(', ')}]`);

    if (type === 'property') {
      await this.processProperties(job, tenantId, targetLanguages, sourceLanguage, propertyIds);
    } else if (type === 'propertyType') {
      await this.processPropertyTypes(job, tenantId, targetLanguages, sourceLanguage);
    } else if (type === 'feature') {
      await this.processFeatures(job, tenantId, targetLanguages, sourceLanguage);
    } else if (type === 'label') {
      await this.processLabels(job, tenantId, targetLanguages, sourceLanguage);
    }
  }

  private async processProperties(
    job: Job,
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
    propertyIds?: number[],
  ): Promise<void> {
    const where: any = { tenantId };
    if (propertyIds?.length) {
      where.id = In(propertyIds);
    }

    const properties = await this.propertyRepository.find({ where });
    const total = properties.length * targetLanguages.length;
    let completed = 0;
    let failed = 0;

    await job.updateProgress({ total, completed, failed });

    const multilingualFields = ['title', 'description', 'metaTitle', 'metaDescription', 'metaKeywords', 'pageTitle'];

    for (const property of properties) {
      const sourceLang = sourceLanguage || this.detectSourceLang(property, multilingualFields);

      const sourceTexts: Record<string, string> = {};
      for (const field of multilingualFields) {
        const val = (property as any)[field] as Record<string, string> | null;
        if (val?.[sourceLang]) {
          sourceTexts[field] = val[sourceLang];
        }
      }

      if (Object.keys(sourceTexts).length === 0) {
        completed += targetLanguages.length;
        await job.updateProgress({ total, completed, failed });
        continue;
      }

      for (const targetLang of targetLanguages) {
        if (targetLang === sourceLang) {
          completed++;
          await job.updateProgress({ total, completed, failed });
          continue;
        }

        try {
          const translations = await this.translateTexts(
            tenantId, sourceTexts, sourceLang, targetLang, 'property',
          );

          for (const [field, translated] of Object.entries(translations)) {
            const current = ((property as any)[field] as Record<string, string>) || {};
            (property as any)[field] = { ...current, [targetLang]: translated };
          }

          completed++;
        } catch (err) {
          this.logger.error(
            `Failed to translate property ${property.id} to ${targetLang}: ${(err as Error).message}`,
          );
          failed++;
          completed++;
        }

        await job.updateProgress({ total, completed, failed });
      }

      await this.propertyRepository.save(property);
    }

    this.logger.log(`Bulk translate complete: ${completed - failed} succeeded, ${failed} failed out of ${total}`);
  }

  private async processPropertyTypes(
    job: Job,
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<void> {
    const entities = await this.propertyTypeRepository.find({ where: { tenantId } });
    await this.processNameEntities(job, entities, tenantId, targetLanguages, sourceLanguage, 'name', this.propertyTypeRepository);
  }

  private async processFeatures(
    job: Job,
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<void> {
    const entities = await this.featureRepository.find({ where: { tenantId } });
    await this.processNameEntities(job, entities, tenantId, targetLanguages, sourceLanguage, 'name', this.featureRepository);
  }

  private async processLabels(
    job: Job,
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<void> {
    const entities = await this.labelRepository.find({ where: { tenantId } });
    await this.processNameEntities(job, entities, tenantId, targetLanguages, sourceLanguage, 'translations', this.labelRepository);
  }

  private async processNameEntities<T extends Record<string, any>>(
    job: Job,
    entities: T[],
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage: string | undefined,
    field: string,
    repo: Repository<T>,
  ): Promise<void> {
    const total = entities.length * targetLanguages.length;
    let completed = 0;
    let failed = 0;

    await job.updateProgress({ total, completed, failed });

    for (const entity of entities) {
      const record = entity[field] as Record<string, string>;
      const sourceLang = sourceLanguage || Object.keys(record).find((k) => record[k]?.trim()) || 'en';

      if (!record[sourceLang]) {
        completed += targetLanguages.length;
        await job.updateProgress({ total, completed, failed });
        continue;
      }

      for (const targetLang of targetLanguages) {
        if (targetLang === sourceLang) {
          completed++;
          await job.updateProgress({ total, completed, failed });
          continue;
        }

        try {
          const result = await this.translateTexts(
            tenantId, { value: record[sourceLang] }, sourceLang, targetLang, 'label',
          );
          (entity as any)[field] = { ...record, [targetLang]: result.value || '' };
          completed++;
        } catch (err) {
          this.logger.error(`Failed to translate entity to ${targetLang}: ${(err as Error).message}`);
          failed++;
          completed++;
        }

        await job.updateProgress({ total, completed, failed });
      }

      await repo.save(entity);
    }
  }

  private async translateTexts(
    tenantId: number,
    texts: Record<string, string>,
    sourceLang: string,
    targetLang: string,
    context: 'property' | 'label',
  ): Promise<Record<string, string>> {
    const LANG_NAMES: Record<string, string> = {
      en: 'English', es: 'Spanish', de: 'German', fr: 'French',
      nl: 'Dutch', pt: 'Portuguese', it: 'Italian', ru: 'Russian',
    };
    const sName = LANG_NAMES[sourceLang] || sourceLang;
    const tName = LANG_NAMES[targetLang] || targetLang;

    const systemPrompt = context === 'property'
      ? `You are a professional real estate translator. Translate from ${sName} to ${tName}. Return ONLY valid JSON with the same keys. No markdown.`
      : `You are a translator. Translate from ${sName} to ${tName}. Return ONLY valid JSON with the same keys. No markdown.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(texts) },
    ];

    const response = await this.aiService.chatCompletion(tenantId, messages, {
      temperature: 0.2,
    });

    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  }

  private detectSourceLang(property: Property, fields: string[]): string {
    for (const field of fields) {
      const val = (property as any)[field] as Record<string, string> | null;
      if (val) {
        const keys = Object.keys(val).filter((k) => val[k]?.trim());
        if (keys.length > 0) return keys[0];
      }
    }
    return 'en';
  }
}
