import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Job } from 'bullmq';
import { Property, PropertyType, Feature, Label } from '../../database/entities';
import { AiService, ChatMessage } from '../ai/ai.service';
import { TenantService } from '../tenant/tenant.service';
import { BulkTranslateJob, langName } from './translation.service';
import type { TranslationMemoryKind } from '../../database/entities';
import { MemoryEntry, TranslationMemoryService, isGap, memoryKey } from '../translation-memory/translation-memory.service';

@Processor('translation', { concurrency: 3 })
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
    private tenantService: TenantService,
    private memory: TranslationMemoryService,
  ) {
    super();
  }

  async process(job: Job<BulkTranslateJob>): Promise<void> {
    const { tenantId, targetLanguages, sourceLanguage, propertyIds, entityType } = job.data;
    const type = entityType || 'property';

    this.logger.log(`Bulk translate ${type}s for tenant ${tenantId} → [${targetLanguages.join(', ')}]`);

    let translated = 0;
    if (type === 'property') {
      translated = await this.processProperties(job, tenantId, targetLanguages, sourceLanguage, propertyIds);
    } else if (type === 'propertyType') {
      translated = await this.processPropertyTypes(job, tenantId, targetLanguages, sourceLanguage);
    } else if (type === 'feature') {
      translated = await this.processFeatures(job, tenantId, targetLanguages, sourceLanguage);
    } else if (type === 'label') {
      translated = await this.processLabels(job, tenantId, targetLanguages, sourceLanguage);
    }

    // One bump for the whole run, after every row is saved: each bump makes
    // the WP plugin rebuild its bundle, so per-row bumps would rebuild it
    // hundreds of times. A run that translated nothing changed nothing.
    if (translated > 0) {
      await this.tenantService.bumpSyncVersionSafely(tenantId, `bulk translate (${type})`);
    }
  }

  // Properties translated at once. Each is a few AI calls (one per language);
  // one at a time an 11k catalogue took days (10-07: 3% in 30 minutes).
  private static readonly PARALLEL = 6;
  private static readonly BATCH = 60;
  private static readonly FIELDS = ['title', 'description', 'metaTitle', 'metaDescription', 'metaKeywords', 'pageTitle'] as const;

  private async processProperties(
    job: Job,
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
    propertyIds?: number[],
  ): Promise<number> {
    const where: any = { tenantId };
    if (propertyIds?.length) {
      where.id = In(propertyIds);
    }

    // Ids first, rows in batches: 11k full rows (descriptions in every
    // language) don't need to sit in memory for the whole run.
    const ids = (await this.propertyRepository.find({ where, select: ['id'], order: { id: 'ASC' } })).map((p) => p.id);
    const total = ids.length * targetLanguages.length;
    let completed = 0;
    let failed = 0;
    let changed = 0;
    let lastReport = 0;
    const report = async (force = false) => {
      if (!force && Date.now() - lastReport < 1000) return;
      lastReport = Date.now();
      await job.updateProgress({ total, completed, failed });
    };
    await report(true);

    for (let i = 0; i < ids.length; i += TranslationProcessor.BATCH) {
      const batch = await this.propertyRepository.find({
        where: { tenantId, id: In(ids.slice(i, i + TranslationProcessor.BATCH)) },
        select: ['id', ...TranslationProcessor.FIELDS],
      });
      await this.runPool(batch, TranslationProcessor.PARALLEL, async (property) => {
        const result = await this.translateProperty(tenantId, property, targetLanguages, sourceLanguage);
        completed += targetLanguages.length;
        failed += result.failed;
        if (result.changed) changed++;
        await report();
      });
    }
    await report(true);

    this.logger.log(`Bulk translate complete: ${completed - failed} succeeded, ${failed} failed out of ${total}`);
    return changed;
  }

  // One property into every target language. Only text the language doesn't
  // have yet is sent, so a second run (or the run starting over after an API
  // restart) skips what is done instead of paying for it again. Only the
  // translated fields are written, so a feed sync running meanwhile keeps its
  // own changes.
  private async translateProperty(
    tenantId: number,
    property: Property,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<{ changed: boolean; failed: number }> {
    const fields = [...TranslationProcessor.FIELDS];
    const sourceLang = sourceLanguage || this.detectSourceLang(property, fields);
    const updates: Record<string, Record<string, string>> = {};
    let failed = 0;

    for (const targetLang of targetLanguages) {
      if (targetLang === sourceLang) continue;
      const texts: Record<string, string> = {};
      for (const field of fields) {
        const val = ((updates[field] ?? (property as any)[field]) as Record<string, string> | null) || {};
        if (val[sourceLang]?.trim() && !val[targetLang]?.trim()) texts[field] = val[sourceLang];
      }
      if (!Object.keys(texts).length) continue;

      try {
        const translations = await this.translateTexts(tenantId, texts, sourceLang, targetLang, 'property');
        for (const [field, text] of Object.entries(translations)) {
          if (!(field in texts) || typeof text !== 'string') continue;
          const current = (updates[field] ?? (property as any)[field]) || {};
          updates[field] = { ...current, [targetLang]: text };
        }
      } catch (err) {
        this.logger.error(`Failed to translate property ${property.id} to ${targetLang}: ${(err as Error).message}`);
        failed++;
      }
    }

    if (!Object.keys(updates).length) return { changed: false, failed };
    await this.propertyRepository.update({ id: property.id, tenantId }, updates as any);
    return { changed: true, failed };
  }

  private async runPool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
    let next = 0;
    const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    });
    await Promise.all(lanes);
  }

  private async processPropertyTypes(
    job: Job,
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<number> {
    const entities = await this.propertyTypeRepository.find({ where: { tenantId } });
    return this.processNameEntities(job, entities, tenantId, targetLanguages, sourceLanguage, 'name', this.propertyTypeRepository, 'property_type');
  }

  private async processFeatures(
    job: Job,
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<number> {
    const entities = await this.featureRepository.find({ where: { tenantId } });
    return this.processNameEntities(job, entities, tenantId, targetLanguages, sourceLanguage, 'name', this.featureRepository, 'feature');
  }

  private async processLabels(
    job: Job,
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage?: string,
  ): Promise<number> {
    const entities = await this.labelRepository.find({ where: { tenantId } });
    return this.processNameEntities(job, entities, tenantId, targetLanguages, sourceLanguage, 'translations', this.labelRepository, 'label');
  }

  // Terms sent to the AI in one call.
  private static readonly TERMS_PER_CALL = 40;

  // Types, features and labels. A language the row already has is skipped
  // (a copy of the English counts as missing); the shared translation memory
  // fills what other clients already paid for; only what is left goes to
  // the AI, many terms per call, and every answer is remembered.
  private async processNameEntities<T extends { id: number } & Record<string, any>>(
    job: Job,
    entities: T[],
    tenantId: number,
    targetLanguages: string[],
    sourceLanguage: string | undefined,
    field: string,
    repo: Repository<T>,
    kind: TranslationMemoryKind,
  ): Promise<number> {
    const total = entities.length * targetLanguages.length;
    let completed = 0;
    let failed = 0;
    await job.updateProgress({ total, completed, failed });

    const records = new Map<number, Record<string, string>>(entities.map((e) => [e.id, { ...((e[field] as Record<string, string>) || {}) }]));
    const changedIds = new Set<number>();
    const remembered = await this.memory
      .lookup(kind, entities.map((e) => records.get(e.id)!.en).filter(Boolean))
      .catch(() => new Map<string, Record<string, string>>());

    // "target:source" → rows still needing that language.
    const pending = new Map<string, { id: number; text: string }[]>();
    for (const e of entities) {
      const record = records.get(e.id)!;
      const sourceLang = sourceLanguage || (record.en?.trim() ? 'en' : Object.keys(record).find((k) => record[k]?.trim())) || 'en';
      const sourceText = record[sourceLang]?.trim();
      const key = memoryKey(record.en);
      const filled = key ? this.memory.applyTo(record, remembered.get(key), targetLanguages.filter((l) => l !== sourceLang)) : null;
      if (filled?.filled.length) {
        records.set(e.id, filled.record);
        changedIds.add(e.id);
      }
      const current = records.get(e.id)!;
      for (const lang of targetLanguages) {
        if (!sourceText || lang === sourceLang || !this.needs(current, lang, sourceLang)) {
          completed++;
          continue;
        }
        const id = `${lang}:${sourceLang}`;
        pending.set(id, [...(pending.get(id) || []), { id: e.id, text: sourceText }]);
      }
    }
    await job.updateProgress({ total, completed, failed });

    for (const [id, rows] of pending) {
      const [targetLang, sourceLang] = id.split(':');
      for (let i = 0; i < rows.length; i += TranslationProcessor.TERMS_PER_CALL) {
        const chunk = rows.slice(i, i + TranslationProcessor.TERMS_PER_CALL);
        const texts: Record<string, string> = {};
        chunk.forEach((r, n) => (texts[String(n + 1)] = r.text));
        try {
          const result = await this.translateTexts(tenantId, texts, sourceLang, targetLang, 'label');
          const learned: MemoryEntry[] = [];
          chunk.forEach((r, n) => {
            const value = result[String(n + 1)];
            const text = typeof value === 'string' ? value.trim() : '';
            if (!text) {
              failed++;
              return;
            }
            const record = records.get(r.id)!;
            records.set(r.id, { ...record, [targetLang]: text });
            changedIds.add(r.id);
            if (record.en?.trim()) learned.push({ en: record.en, lang: targetLang, text });
          });
          if (sourceLang === 'en') await this.memory.remember(kind, learned);
        } catch (err) {
          this.logger.error(`Failed to translate ${chunk.length} ${kind} terms to ${targetLang}: ${(err as Error).message}`);
          failed += chunk.length;
        }
        completed += chunk.length;
        await job.updateProgress({ total, completed, failed });
      }
    }

    // Only the translated column is written, so edits made meanwhile to
    // anything else on the row are kept.
    for (const id of changedIds) {
      await repo.update({ id, tenantId } as any, { [field]: records.get(id) } as any);
    }
    return changedIds.size;
  }

  // A language still to translate: empty, or a copy of the source text.
  private needs(record: Record<string, string>, lang: string, sourceLang: string): boolean {
    const v = record[lang]?.trim();
    return !v || (sourceLang === 'en' ? isGap(record, lang) : v === record[sourceLang]?.trim());
  }

  private async translateTexts(
    tenantId: number,
    texts: Record<string, string>,
    sourceLang: string,
    targetLang: string,
    context: 'property' | 'label',
  ): Promise<Record<string, string>> {
    const sName = langName(sourceLang);
    const tName = langName(targetLang);

    const systemPrompt = context === 'property'
      ? `You are a professional real estate translator. Translate from ${sName} to ${tName}. Return ONLY valid JSON with the same keys. No markdown.`
      : `You are a translator for a real estate website. Translate each value (a UI label, property feature or property type) from ${sName} to ${tName}. Keep it short, as it would appear on a property portal. Keep placeholders like {n} exactly as they are. Return ONLY valid JSON with the same keys. No markdown.`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(texts) },
    ];

    // Property text spends only the client's key; types, features and labels
    // the client's key when set, else the platform key from .env. One retry: with several calls in flight a rate
    // limit or a reply that isn't JSON is usually gone a few seconds later.
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await this.aiService.chatCompletion(tenantId, messages, {
          temperature: 0.2,
          keySource: context === 'property' ? 'client' : 'client-first',
        });
        const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        return JSON.parse(cleaned);
      } catch (err) {
        if (attempt >= 2) throw err;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
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
