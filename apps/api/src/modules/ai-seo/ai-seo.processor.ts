import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Property } from '../../database/entities';
import { AiSeoService, BulkSeoJob } from './ai-seo.service';

// Concurrency 1 on purpose. Each property is several OpenRouter calls, and a
// 15k-property catalog run in parallel earns a 429 (or a 402 once the tenant's
// credit runs dry) long before it earns any wall-clock back.
@Processor('ai-seo', { concurrency: 1 })
export class AiSeoProcessor extends WorkerHost {
  private readonly logger = new Logger(AiSeoProcessor.name);

  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    private readonly aiSeoService: AiSeoService,
  ) {
    super();
  }

  async process(job: Job<BulkSeoJob>): Promise<void> {
    const { tenantId, targetLanguages, overwrite, includeSchema, includeSlug, propertyIds } =
      job.data;

    // Ids only. Loading 15k full property rows — descriptions, image arrays and
    // all — just to iterate them would blow the worker's heap.
    const where: any = { tenantId };
    if (propertyIds?.length) where.id = In(propertyIds);
    const rows = await this.propertyRepository.find({
      where,
      select: ['id'],
      order: { id: 'ASC' },
    });
    const ids = rows.map((r) => r.id);

    const total = ids.length;
    let completed = 0;
    let failed = 0;
    let skipped = 0;
    await job.updateProgress({ total, completed, failed, skipped });

    this.logger.log(
      `Bulk SEO for tenant ${tenantId}: ${total} properties → [${targetLanguages.join(', ')}]` +
        `${overwrite ? ' (overwrite)' : ''}${includeSchema ? ' +schema' : ''}${includeSlug ? ' +slug' : ''}`,
    );

    for (const id of ids) {
      try {
        const property = await this.propertyRepository.findOne({ where: { id, tenantId } });
        if (!property) {
          skipped++;
          completed++;
          await job.updateProgress({ total, completed, failed, skipped });
          continue;
        }

        const languages = overwrite
          ? targetLanguages
          : targetLanguages.filter((lang) => !this.hasSeo(property, lang));
        const needsSchema = includeSchema === true && (overwrite || !property.seoSchemaJson);
        // Never rewrite a slug that already exists, even with overwrite on: it
        // is a live URL and nothing here issues redirects for the old one.
        const needsSlug = includeSlug === true && !property.slug;

        if (languages.length === 0 && !needsSchema && !needsSlug) {
          skipped++;
          completed++;
          await job.updateProgress({ total, completed, failed, skipped });
          continue;
        }

        if (languages.length > 0) {
          const generated = await this.aiSeoService.generateSeoForProperty(
            tenantId,
            id,
            languages,
          );
          // Merge per language so the languages this run didn't touch survive.
          for (const [lang, fields] of Object.entries(generated)) {
            property.pageTitle = { ...(property.pageTitle || {}), [lang]: fields.pageTitle };
            property.metaTitle = { ...(property.metaTitle || {}), [lang]: fields.metaTitle };
            property.metaDescription = {
              ...(property.metaDescription || {}),
              [lang]: fields.metaDescription,
            };
            property.metaKeywords = {
              ...(property.metaKeywords || {}),
              [lang]: fields.metaKeywords,
            };
          }
        }

        if (needsSchema) {
          const { schema } = await this.aiSeoService.generateSchemaForProperty(tenantId, id);
          property.seoSchemaJson = schema;
        }

        if (needsSlug) {
          property.slug = await this.buildUniqueSlug(tenantId, property);
        }

        await this.propertyRepository.save(property);
      } catch (err) {
        // One bad property (no content to work from, a malformed model reply)
        // must not take the rest of the catalog down with it.
        this.logger.warn(`Bulk SEO failed for property ${id}: ${(err as Error).message}`);
        failed++;
      }

      completed++;
      await job.updateProgress({ total, completed, failed, skipped });
    }

    this.logger.log(
      `Bulk SEO complete for tenant ${tenantId}: ${completed - failed - skipped} generated, ` +
        `${skipped} already done, ${failed} failed out of ${total}`,
    );
  }

  // "Already has SEO" means the three fields that actually render in the page
  // head. Keywords are optional and carry no weight, so a missing one is not a
  // reason to pay for a regeneration.
  private hasSeo(property: Property, lang: string): boolean {
    return Boolean(
      property.pageTitle?.[lang]?.trim() &&
        property.metaTitle?.[lang]?.trim() &&
        property.metaDescription?.[lang]?.trim(),
    );
  }

  private async buildUniqueSlug(tenantId: number, property: Property): Promise<string | null> {
    const source =
      property.pageTitle?.en?.trim() ||
      property.metaTitle?.en?.trim() ||
      property.title?.en?.trim() ||
      Object.values(property.title || {}).find((v) => v?.trim()) ||
      '';

    let base = this.slugify(source);
    if (!base) base = this.slugify(property.reference || '');
    if (!base) return null;
    // Leave room for the "-2" style suffix inside the column's 255 chars.
    base = base.slice(0, 240);

    let candidate = base;
    for (let attempt = 2; attempt < 100; attempt++) {
      const clash = await this.propertyRepository.findOne({
        where: { tenantId, slug: candidate, id: Not(property.id) },
        select: ['id'],
      });
      if (!clash) return candidate;
      candidate = `${base}-${attempt}`;
    }
    // Pathological case — fall back to something guaranteed unique per tenant.
    return `${base}-${property.id}`;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
