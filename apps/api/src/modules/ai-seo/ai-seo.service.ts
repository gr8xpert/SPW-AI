import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Property } from '../../database/entities';
import { AiService, ChatMessage } from '../ai/ai.service';
import { BulkGenerateSeoDto } from './dto/bulk-generate-seo.dto';

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

export interface PropertySeoLangResult {
  pageTitle: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
}

export type PropertySeoResult = Record<string, PropertySeoLangResult>;

export interface BulkSeoJob {
  tenantId: number;
  targetLanguages: string[];
  overwrite?: boolean;
  includeSchema?: boolean;
  includeSlug?: boolean;
  propertyIds?: number[];
}

export interface BulkSeoJobStatus {
  jobId: string;
  status: string;
  progress: number;
  total: number;
  completed: number;
  failed: number;
  // Properties whose SEO was already filled in every requested language, so no
  // AI call was made for them.
  skipped: number;
}

@Injectable()
export class AiSeoService {
  private readonly logger = new Logger(AiSeoService.name);

  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectQueue('ai-seo')
    private readonly seoQueue: Queue,
    private readonly aiService: AiService,
  ) {}

  // Queues a catalog-wide SEO pass. Returns the candidate count up front so the
  // dashboard can show what it's about to spend before anything runs — at a few
  // thousand properties x languages this is real money on the tenant's
  // OpenRouter key.
  async bulkGenerate(
    tenantId: number,
    dto: BulkGenerateSeoDto,
  ): Promise<{ jobId: string; total: number; alreadyRunning?: boolean }> {
    if (!Array.isArray(dto.targetLanguages) || dto.targetLanguages.length === 0) {
      throw new BadRequestException('At least one target language is required');
    }

    // One run per tenant. A second click — after a refresh, from another tab,
    // or by a teammate — hands back the job already in flight instead of
    // queueing a duplicate that would pay for the same properties again.
    const running = await this.findActiveJob(tenantId);
    if (running) {
      return { jobId: running.jobId, total: running.total, alreadyRunning: true };
    }

    const where: any = { tenantId };
    if (dto.propertyIds?.length) where.id = In(dto.propertyIds);
    const total = await this.propertyRepository.count({ where });
    if (total === 0) {
      throw new BadRequestException('No properties match this selection.');
    }

    const job = await this.seoQueue.add(
      'bulk-seo',
      {
        tenantId,
        targetLanguages: dto.targetLanguages,
        overwrite: dto.overwrite === true,
        includeSchema: dto.includeSchema === true,
        includeSlug: dto.includeSlug === true,
        propertyIds: dto.propertyIds,
      } as BulkSeoJob,
      // One attempt: a retry would re-pay for every property already done.
      { attempts: 1, removeOnComplete: { age: 3600 }, removeOnFail: { age: 7200 } },
    );

    return { jobId: job.id!, total };
  }

  // The dashboard asks this on mount so progress survives a refresh or
  // navigating away — the job runs server-side regardless of the page.
  async findActiveJob(tenantId: number): Promise<BulkSeoJobStatus | null> {
    const jobs = await this.seoQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
    const job = jobs.find((j) => j?.data?.tenantId === tenantId);
    return job ? this.toStatus(job) : null;
  }

  async getJobStatus(jobId: string, tenantId: number): Promise<BulkSeoJobStatus | null> {
    const job = await this.seoQueue.getJob(jobId);
    // Job ids are sequential — don't let one tenant read another's run.
    if (!job || job.data?.tenantId !== tenantId) return null;
    return this.toStatus(job);
  }

  private async toStatus(job: Job<BulkSeoJob>): Promise<BulkSeoJobStatus> {
    const state = await job.getState();
    const progress = (job.progress as any) || { total: 0, completed: 0, failed: 0, skipped: 0 };

    return {
      jobId: job.id!,
      status: state,
      progress: progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0,
      total: progress.total || 0,
      completed: progress.completed || 0,
      failed: progress.failed || 0,
      skipped: progress.skipped || 0,
    };
  }

  // Generates SEO fields for one property in each requested target language.
  // Sources the base content from the property's own title/description in the
  // detected source language (first available of the target languages, else
  // the first non-empty entry). Returns the raw generated blob; the caller
  // is responsible for merging into the existing multilingual JSON columns.
  async generateSeoForProperty(
    tenantId: number,
    propertyId: number,
    targetLanguages: string[],
  ): Promise<PropertySeoResult> {
    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      throw new BadRequestException('At least one target language is required');
    }

    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, tenantId },
    });
    if (!property) throw new NotFoundException('Property not found');

    const source = this.pickSourceContent(property, targetLanguages);
    if (!source.title && !source.description) {
      throw new BadRequestException(
        'Property has no title or description to generate SEO from. Fill in the Content tab first.',
      );
    }

    const result: PropertySeoResult = {};
    for (const lang of targetLanguages) {
      try {
        result[lang] = await this.generateForLanguage(tenantId, property, source, lang);
      } catch (err) {
        this.logger.warn(
          `AI SEO generation failed for property ${propertyId} lang=${lang}: ${(err as Error).message}`,
        );
        throw err;
      }
    }
    return result;
  }

  // Generates a schema.org RealEstateListing JSON-LD block for one property.
  // Returns the raw JSON string (already validated as parseable). Caller
  // typically drops this straight into the seoSchemaJson textarea for review
  // before save. Uses the property's own fields as ground truth — the model
  // is instructed to NEVER invent facts.
  async generateSchemaForProperty(
    tenantId: number,
    propertyId: number,
  ): Promise<{ schema: string }> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, tenantId },
    });
    if (!property) throw new NotFoundException('Property not found');

    // Prefer English content for the schema body since JSON-LD is
    // machine-consumed and English is the schema.org canonical language.
    const source = this.pickSourceContent(property, ['en']);

    const context = this.buildPropertyContext(property, source);
    const imageUrls = (property.images || [])
      .map((img: any) => img?.url)
      .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)
      .slice(0, 8);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are an expert in schema.org structured data for real estate. Given a property listing, produce a valid JSON-LD block using the RealEstateListing type (or Product with subtype for rentals). Only include properties whose values are present in the input — NEVER invent facts. Output STRICT JSON only, no prose, no markdown fences, no comments.',
      },
      {
        role: 'user',
        content: `Generate schema.org JSON-LD for this property.

Property details:
${context}

Images (use up to 8):
${imageUrls.length > 0 ? imageUrls.map((u) => `- ${u}`).join('\n') : '(no images)'}

Requirements:
- Root object must include "@context": "https://schema.org" and "@type": "RealEstateListing".
- Include nested "address" (PostalAddress) if street/postcode/location present.
- Include nested "geo" (GeoCoordinates) if lat/lng present.
- Include "offers" (Offer) with price + priceCurrency if price present. Use availability "https://schema.org/InStock" for active listings.
- Include "numberOfBedrooms", "numberOfBathroomsTotal", "floorSize" (QuantitativeValue with unitText "MTK") as applicable.
- Include "image" as an array of URL strings.
- Include "name" and "description" from the property.
- Output STRICT JSON only.`,
      },
    ];

    const raw = await this.aiService.chatCompletion(tenantId, messages, {
      temperature: 0.2,
      maxTokens: 1500,
      allowPlatformKey: true,
    });

    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json|ld\+json)?\s*/i, '').replace(/```$/i, '').trim();
    // Round-trip through JSON.parse to normalize + guarantee parseability.
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new BadRequestException(
        'AI returned malformed JSON-LD. Try again or contact support if this persists.',
      );
    }
    if (!parsed || typeof parsed !== 'object' || !parsed['@type']) {
      throw new BadRequestException('AI returned an invalid JSON-LD block (missing @type).');
    }
    return { schema: JSON.stringify(parsed, null, 2) };
  }

  private pickSourceContent(
    property: Property,
    targetLanguages: string[],
  ): { title: string; description: string; lang: string } {
    const preferred = ['en', ...targetLanguages];
    const titleMap = (property.title || {}) as Record<string, string>;
    const descMap = (property.description || {}) as Record<string, string>;

    for (const lang of preferred) {
      const t = titleMap[lang]?.trim();
      const d = descMap[lang]?.trim();
      if (t || d) return { title: t || '', description: d || '', lang };
    }
    // Fallback: any non-empty entry
    for (const [lang, val] of Object.entries(titleMap)) {
      if (val?.trim()) return { title: val, description: descMap[lang] || '', lang };
    }
    for (const [lang, val] of Object.entries(descMap)) {
      if (val?.trim()) return { title: titleMap[lang] || '', description: val, lang };
    }
    return { title: '', description: '', lang: 'en' };
  }

  private async generateForLanguage(
    tenantId: number,
    property: Property,
    source: { title: string; description: string; lang: string },
    targetLang: string,
  ): Promise<PropertySeoLangResult> {
    const context = this.buildPropertyContext(property, source);
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are an expert SEO copywriter for a real estate listing site. Given a property, produce concise, high-converting SEO metadata that would rank well on Google and drive clicks. Never invent facts not present in the input. Output STRICT JSON only, no prose, no markdown fences.',
      },
      {
        role: 'user',
        content: this.buildUserPrompt(context, targetLang),
      },
    ];

    // Tenant's own OpenRouter key when they've set one, otherwise the platform
    // key from OPENROUTER_API_KEY — a bulk run must not stop at tenants who
    // never configured AI themselves.
    const raw = await this.aiService.chatCompletion(tenantId, messages, {
      temperature: 0.4,
      maxTokens: 800,
      allowPlatformKey: true,
    });

    return this.parseResponse(raw);
  }

  private buildPropertyContext(
    property: Property,
    source: { title: string; description: string; lang: string },
  ): string {
    const parts: string[] = [];
    if (source.title) parts.push(`Title (${langName(source.lang)}): ${source.title}`);
    if (source.description) parts.push(`Description (${langName(source.lang)}): ${source.description}`);
    if (property.reference) parts.push(`Reference: ${property.reference}`);
    if (property.listingType) parts.push(`Listing type: ${property.listingType}`);
    if (property.price != null) parts.push(`Price: ${property.price} ${property.currency || ''}`.trim());
    if (property.bedrooms != null) parts.push(`Bedrooms: ${property.bedrooms}`);
    if (property.bathrooms != null) parts.push(`Bathrooms: ${property.bathrooms}`);
    if (property.buildSize != null) parts.push(`Build size: ${property.buildSize} m²`);
    if (property.plotSize != null) parts.push(`Plot size: ${property.plotSize} m²`);
    if (property.urbanization) parts.push(`Urbanization: ${property.urbanization}`);
    if (property.street) parts.push(`Street: ${property.street}`);
    if (property.postcode) parts.push(`Postcode: ${property.postcode}`);
    if (property.geoLocationLabel) parts.push(`Location: ${property.geoLocationLabel}`);
    return parts.join('\n');
  }

  private buildUserPrompt(context: string, targetLang: string): string {
    return `Property details:
${context}

Generate SEO metadata in ${langName(targetLang)} for this property listing page. Follow these limits strictly:
- pageTitle: max 60 chars, include property type + location if space allows
- metaTitle: max 60 chars, compelling and keyword-rich, may differ from pageTitle
- metaDescription: max 155 chars, 1-2 sentences, include a call to action
- metaKeywords: 5-10 comma-separated keywords/phrases

Return STRICT JSON with exactly these four keys:
{"pageTitle":"...","metaTitle":"...","metaDescription":"...","metaKeywords":"..."}`;
  }

  private parseResponse(raw: string): PropertySeoLangResult {
    let cleaned = raw.trim();
    // Strip markdown fences the model sometimes adds despite instructions.
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new BadRequestException(
        'AI returned malformed JSON. Try again or contact support if this persists.',
      );
    }
    const out: PropertySeoLangResult = {
      pageTitle: String(parsed.pageTitle || '').trim(),
      metaTitle: String(parsed.metaTitle || '').trim(),
      metaDescription: String(parsed.metaDescription || '').trim(),
      metaKeywords: String(parsed.metaKeywords || '').trim(),
    };
    if (!out.pageTitle && !out.metaTitle && !out.metaDescription) {
      throw new BadRequestException('AI returned empty SEO fields. Try again.');
    }
    return out;
  }
}
