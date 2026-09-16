import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Property, PropertyType, Feature, Label } from '../../database/entities';
import { AiService, ChatMessage } from '../ai/ai.service';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', es: 'Spanish', de: 'German', fr: 'French',
  nl: 'Dutch', pt: 'Portuguese', it: 'Italian', ru: 'Russian',
  sv: 'Swedish', no: 'Norwegian', da: 'Danish', pl: 'Polish',
  cs: 'Czech', fi: 'Finnish', ar: 'Arabic', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean',
};

function langName(code: string): string {
  return LANGUAGE_NAMES[code] || code;
}

export interface TranslationResult {
  translated: Record<string, Record<string, string>>;
  fieldsTranslated: number;
}

export interface BulkTranslateJob {
  tenantId: number;
  targetLanguages: string[];
  sourceLanguage?: string;
  propertyIds?: number[];
  entityType?: 'property' | 'propertyType' | 'feature' | 'label';
}

export interface BulkJobStatus {
  jobId: string;
  status: string;
  progress: number;
  total: number;
  completed: number;
  failed: number;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    @InjectRepository(Label)
    private labelRepository: Repository<Label>,
    @InjectQueue('translation')
    private translationQueue: Queue,
    private aiService: AiService,
  ) {}

  async translateProperty(
    tenantId: number,
    propertyId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, tenantId },
    });
    if (!property) throw new NotFoundException('Property not found');

    const multilingualFields = ['title', 'description', 'metaTitle', 'metaDescription', 'metaKeywords', 'pageTitle'];
    const sourceLang = sourceLanguage || this.detectSourceLanguage(property, multilingualFields);

    const sourceTexts: Record<string, string> = {};
    for (const field of multilingualFields) {
      const val = (property as any)[field] as Record<string, string> | null;
      if (val?.[sourceLang]) {
        sourceTexts[field] = val[sourceLang];
      }
    }

    if (Object.keys(sourceTexts).length === 0) {
      return property;
    }

    for (const targetLang of targetLanguages) {
      if (targetLang === sourceLang) continue;

      const translations = await this.translateTexts(
        tenantId, sourceTexts, sourceLang, targetLang, 'property',
      );

      for (const [field, translated] of Object.entries(translations)) {
        const current = ((property as any)[field] as Record<string, string>) || {};
        (property as any)[field] = { ...current, [targetLang]: translated };
      }
    }

    return this.propertyRepository.save(property);
  }

  async translatePropertyType(
    tenantId: number,
    id: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<PropertyType> {
    const entity = await this.propertyTypeRepository.findOne({ where: { id, tenantId } });
    if (!entity) throw new NotFoundException('Property type not found');

    const sourceLang = sourceLanguage || this.detectSourceLang(entity.name);
    if (!entity.name[sourceLang]) return entity;

    for (const targetLang of targetLanguages) {
      if (targetLang === sourceLang) continue;
      const result = await this.translateTexts(
        tenantId, { name: entity.name[sourceLang] }, sourceLang, targetLang, 'label',
      );
      entity.name = { ...entity.name, [targetLang]: result.name || entity.name[targetLang] || '' };
    }

    return this.propertyTypeRepository.save(entity);
  }

  async translateFeature(
    tenantId: number,
    id: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<Feature> {
    const entity = await this.featureRepository.findOne({ where: { id, tenantId } });
    if (!entity) throw new NotFoundException('Feature not found');

    const sourceLang = sourceLanguage || this.detectSourceLang(entity.name);
    if (!entity.name[sourceLang]) return entity;

    for (const targetLang of targetLanguages) {
      if (targetLang === sourceLang) continue;
      const result = await this.translateTexts(
        tenantId, { name: entity.name[sourceLang] }, sourceLang, targetLang, 'label',
      );
      entity.name = { ...entity.name, [targetLang]: result.name || entity.name[targetLang] || '' };
    }

    return this.featureRepository.save(entity);
  }

  async translateLabel(
    tenantId: number,
    id: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<Label> {
    const entity = await this.labelRepository.findOne({ where: { id, tenantId } });
    if (!entity) throw new NotFoundException('Label not found');

    const sourceLang = sourceLanguage || this.detectSourceLang(entity.translations);
    if (!entity.translations[sourceLang]) return entity;

    for (const targetLang of targetLanguages) {
      if (targetLang === sourceLang) continue;
      const result = await this.translateTexts(
        tenantId, { value: entity.translations[sourceLang] }, sourceLang, targetLang, 'label',
      );
      entity.translations = { ...entity.translations, [targetLang]: result.value || entity.translations[targetLang] || '' };
    }

    return this.labelRepository.save(entity);
  }

  async bulkTranslate(
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
    propertyIds?: number[],
  ): Promise<{ jobId: string; alreadyRunning?: boolean }> {
    // One run per tenant + entity type: a repeat click resumes the job in
    // flight rather than paying to translate the same catalog twice.
    const running = await this.findActiveJob(tenantId, 'property');
    if (running) return { jobId: running.jobId, alreadyRunning: true };

    const job = await this.translationQueue.add('bulk-translate', {
      tenantId,
      targetLanguages,
      sourceLanguage,
      propertyIds,
      entityType: 'property',
    } as BulkTranslateJob, {
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 7200 },
    });

    return { jobId: job.id! };
  }

  async bulkTranslateEntity(
    tenantId: number,
    entityType: 'propertyType' | 'feature' | 'label',
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<{ jobId: string; alreadyRunning?: boolean }> {
    const running = await this.findActiveJob(tenantId, entityType);
    if (running) return { jobId: running.jobId, alreadyRunning: true };

    const job = await this.translationQueue.add('bulk-translate', {
      tenantId,
      targetLanguages,
      sourceLanguage,
      entityType,
    } as BulkTranslateJob, {
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 7200 },
    });

    return { jobId: job.id! };
  }

  // The dashboard asks this on mount so progress survives a refresh or
  // navigating away — the job keeps running server-side regardless.
  async findActiveJob(
    tenantId: number,
    entityType: NonNullable<BulkTranslateJob['entityType']>,
  ): Promise<BulkJobStatus | null> {
    const jobs = await this.translationQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
    const job = jobs.find(
      (j) => j?.data?.tenantId === tenantId && (j.data.entityType ?? 'property') === entityType,
    );
    return job ? this.toStatus(job) : null;
  }

  async getJobStatus(jobId: string, tenantId: number): Promise<BulkJobStatus | null> {
    const job = await this.translationQueue.getJob(jobId);
    // Job ids are sequential — don't let one tenant read another's run.
    if (!job || job.data?.tenantId !== tenantId) return null;
    return this.toStatus(job);
  }

  private async toStatus(job: Job<BulkTranslateJob>): Promise<BulkJobStatus> {
    const state = await job.getState();
    const progress = (job.progress as any) || { total: 0, completed: 0, failed: 0 };

    return {
      jobId: job.id!,
      status: state,
      progress: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
      total: progress.total || 0,
      completed: progress.completed || 0,
      failed: progress.failed || 0,
    };
  }

  async translateTexts(
    tenantId: number,
    texts: Record<string, string>,
    sourceLang: string,
    targetLang: string,
    context: 'property' | 'label',
  ): Promise<Record<string, string>> {
    const systemPrompt = context === 'property'
      ? `You are a professional real estate translator. Translate property listing content from ${langName(sourceLang)} to ${langName(targetLang)}.

Rules:
- Use natural, marketing-quality language for property listings
- For metaTitle and pageTitle: optimize for SEO, keep under 60 characters
- For metaDescription: optimize for SEO, keep under 160 characters
- For metaKeywords: translate and localize keyword terms, comma-separated
- Maintain the professional tone of the source text
- Return ONLY a valid JSON object with the same keys and translated values
- Do NOT include any markdown formatting or code fences in your response`
      : `You are a professional translator. Translate the following terms from ${langName(sourceLang)} to ${langName(targetLang)}.
These are UI labels or category names for a real estate platform.
Return ONLY a valid JSON object with the same keys and translated values.
Do NOT include any markdown formatting or code fences in your response`;

    const userContent = JSON.stringify(texts, null, 2);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const response = await this.aiService.chatCompletion(tenantId, messages, {
      temperature: 0.2,
    });

    try {
      const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      this.logger.error(`Failed to parse AI translation response: ${response.substring(0, 200)}`);
      return {};
    }
  }

  private detectSourceLanguage(property: Property, fields: string[]): string {
    for (const field of fields) {
      const val = (property as any)[field] as Record<string, string> | null;
      if (val) {
        const keys = Object.keys(val).filter((k) => val[k]?.trim());
        if (keys.length > 0) return keys[0];
      }
    }
    return 'en';
  }

  private detectSourceLang(record: Record<string, string>): string {
    const keys = Object.keys(record).filter((k) => record[k]?.trim());
    return keys[0] || 'en';
  }
}
