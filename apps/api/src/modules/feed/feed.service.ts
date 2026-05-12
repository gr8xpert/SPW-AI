import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { FeedConfig, FeedImportLog, ImportError } from '../../database/entities';
import { Property, PropertyImage, Location, PropertyType, Feature, Tenant } from '../../database/entities';
import { CreateFeedConfigDto, UpdateFeedConfigDto } from './dto';
import { ResalesAdapter, InmobaAdapter, KyeroAdapter, OdooAdapter, BaseFeedAdapter, FeedProperty, FeedPropertyImage } from './adapters';
import { TenantService } from '../tenant/tenant.service';
import { UploadService } from '../upload/upload.service';
import { AiEnrichmentService } from '../ai-enrichment/ai-enrichment.service';

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);
  private readonly adapters: Map<string, BaseFeedAdapter>;

  constructor(
    @InjectRepository(FeedConfig)
    private feedConfigRepository: Repository<FeedConfig>,
    @InjectRepository(FeedImportLog)
    private importLogRepository: Repository<FeedImportLog>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private propertyTypeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectQueue('feed-import')
    private feedImportQueue: Queue,
    private resalesAdapter: ResalesAdapter,
    private inmobaAdapter: InmobaAdapter,
    private kyeroAdapter: KyeroAdapter,
    private odooAdapter: OdooAdapter,
    private readonly tenantService: TenantService,
    private readonly uploadService: UploadService,
    private readonly aiEnrichmentService: AiEnrichmentService,
  ) {
    this.adapters = new Map<string, BaseFeedAdapter>([
      ['resales', this.resalesAdapter],
      ['inmoba', this.inmobaAdapter],
      ['kyero', this.kyeroAdapter],
      ['odoo', this.odooAdapter],
    ]);
  }

  getAdapter(provider: string): BaseFeedAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new BadRequestException(`Unknown feed provider: ${provider}`);
    }
    return adapter;
  }

  async findAllConfigs(tenantId: number): Promise<FeedConfig[]> {
    return this.feedConfigRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findConfigById(tenantId: number, id: number): Promise<FeedConfig> {
    const config = await this.feedConfigRepository.findOne({
      where: { id, tenantId },
    });

    if (!config) {
      throw new NotFoundException('Feed config not found');
    }

    return config;
  }

  async createConfig(tenantId: number, dto: CreateFeedConfigDto): Promise<FeedConfig> {
    const adapter = this.getAdapter(dto.provider);
    const result = await adapter.validateCredentials(dto.credentials);

    if (!result.valid) {
      throw new BadRequestException(result.error || 'Invalid feed credentials');
    }

    const config = this.feedConfigRepository.create({
      ...dto,
      tenantId,
    });

    return this.feedConfigRepository.save(config);
  }

  async updateConfig(
    tenantId: number,
    id: number,
    dto: UpdateFeedConfigDto,
  ): Promise<FeedConfig> {
    const config = await this.findConfigById(tenantId, id);

    if (dto.credentials) {
      const adapter = this.getAdapter(config.provider);
      const result = await adapter.validateCredentials(dto.credentials);

      if (!result.valid) {
        throw new BadRequestException(result.error || 'Invalid feed credentials');
      }
    }

    Object.assign(config, dto);
    return this.feedConfigRepository.save(config);
  }

  async deleteConfig(tenantId: number, id: number): Promise<void> {
    const config = await this.findConfigById(tenantId, id);
    await this.feedConfigRepository.remove(config);
  }

  async triggerSync(tenantId: number, configId: number): Promise<FeedImportLog> {
    const config = await this.findConfigById(tenantId, configId);

    const importLog = this.importLogRepository.create({
      feedConfigId: config.id,
      tenantId: config.tenantId,
      startedAt: new Date(),
      status: 'running',
    });

    await this.importLogRepository.save(importLog);

    await this.feedImportQueue.add('import', {
      configId: config.id,
      importLogId: importLog.id,
      tenantId,
    });

    return importLog;
  }

  async processImport(configId: number, importLogId: number): Promise<void> {
    const config = await this.feedConfigRepository.findOne({ where: { id: configId } });
    if (!config) {
      throw new NotFoundException('Feed config not found');
    }

    const importLog = await this.importLogRepository.findOne({ where: { id: importLogId } });
    if (!importLog) {
      throw new NotFoundException('Import log not found');
    }

    const adapter = this.getAdapter(config.provider);
    const errors: ImportError[] = [];

    let totalFetched = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let page = 1;
    let hasMore = true;

    try {
      while (hasMore) {
        const result = await adapter.fetchProperties(config.credentials, page, 100);

        totalFetched += result.properties.length;

        for (const feedProperty of result.properties) {
          try {
            const outcome = await this.importProperty(
              config.tenantId,
              config.provider,
              feedProperty,
              config.fieldMapping,
            );

            if (outcome === 'created') createdCount++;
            else if (outcome === 'updated') updatedCount++;
            else skippedCount++;
          } catch (error) {
            errors.push({
              ref: feedProperty.reference,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Persist progress after each page so the dashboard can poll status
        importLog.totalFetched = totalFetched;
        importLog.createdCount = createdCount;
        importLog.updatedCount = updatedCount;
        importLog.skippedCount = skippedCount;
        importLog.errorCount = errors.length;
        await this.importLogRepository.save(importLog);

        hasMore = result.hasMore;
        page++;
      }

      importLog.status = errors.length > 0 ? 'partial' : 'success';
      importLog.completedAt = new Date();
      importLog.totalFetched = totalFetched;
      importLog.createdCount = createdCount;
      importLog.updatedCount = updatedCount;
      importLog.skippedCount = skippedCount;
      importLog.errorCount = errors.length;
      importLog.errors = errors.length > 0 ? errors.slice(0, 100) : null;

      await this.importLogRepository.save(importLog);

      config.lastSyncAt = new Date();
      config.lastSyncStatus = importLog.status as any;
      config.lastSyncCount = totalFetched;
      config.lastError = null;

      await this.feedConfigRepository.save(config);

      if (createdCount > 0 || updatedCount > 0) {
        try {
          await this.tenantService.clearCache(config.tenantId, {
            reason: `feed_import:${config.provider}`,
          });
        } catch (err) {
          this.logger.warn(
            `Cache invalidation failed after feed import for tenant=${config.tenantId}: ${(err as Error).message}`,
          );
        }

        // Auto-enrich newly-imported data with AI: fill location regions,
        // group property-type subtypes, recategorise features still in 'other'.
        // Failures are non-fatal — the import already succeeded and the user
        // can always click "✨ AI organize" manually from the dashboard.
        try {
          const enrichment = await this.aiEnrichmentService.enrichAll(config.tenantId);
          this.logger.log(
            `AI enrichment for tenant=${config.tenantId}: ` +
              `+${enrichment.locations.regionsCreated} regions, ` +
              `${enrichment.locations.provincesAttached} provinces attached, ` +
              `+${enrichment.propertyTypes.parentsCreated} type parents, ` +
              `${enrichment.propertyTypes.childrenAttached} children attached, ` +
              `${enrichment.features.recategorised} features recategorised`,
          );
        } catch (err) {
          this.logger.warn(
            `AI enrichment failed after import for tenant=${config.tenantId}: ${(err as Error).message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Feed import failed for config ${configId}`, error);

      importLog.status = 'failed';
      importLog.completedAt = new Date();
      importLog.errors = [{ ref: 'system', error: String(error) }];

      await this.importLogRepository.save(importLog);

      config.lastSyncAt = new Date();
      config.lastSyncStatus = 'failed';
      config.lastError = String(error);

      await this.feedConfigRepository.save(config);
    }
  }

  private async importProperty(
    tenantId: number,
    provider: string,
    feedProperty: FeedProperty,
    fieldMapping: any,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const existing = await this.propertyRepository.findOne({
      where: {
        tenantId,
        source: provider as any,
        externalId: feedProperty.externalId,
      },
    });

    const contentHash = this.computeFeedHash(feedProperty);

    if (existing) {
      if (!existing.syncEnabled) return 'skipped';

      const dataChanged = existing.contentHash !== contentHash;
      const imagesChanged = this.haveImagesChanged(
        feedProperty.images,
        existing.images,
      );
      const promoteFromDraft = existing.status === 'draft';
      const neverPublished = !existing.isPublished && !existing.publishedAt;
      const missingPropertyType = !existing.propertyTypeId && !!feedProperty.propertyType && feedProperty.propertyType !== 'Unknown';
      const missingFeatures = (!existing.features || existing.features.length === 0) && feedProperty.features.length > 0;

      if (!dataChanged && !imagesChanged && !promoteFromDraft && !neverPublished && !missingPropertyType && !missingFeatures) return 'skipped';

      const lockedFields = existing.lockedFields || [];
      const updateData: Partial<Property> = {};

      if (promoteFromDraft && !lockedFields.includes('status')) {
        updateData.status = 'active';
      }

      if (neverPublished && !lockedFields.includes('isPublished')) {
        updateData.isPublished = true;
        updateData.publishedAt = new Date();
      }

      if (missingPropertyType && !lockedFields.includes('propertyTypeId')) {
        const propertyTypeId = await this.findPropertyTypeId(tenantId, feedProperty.propertyType);
        if (propertyTypeId !== null) updateData.propertyTypeId = propertyTypeId;
      }

      if (missingFeatures && !lockedFields.includes('features')) {
        updateData.features = await this.findFeatureIds(tenantId, feedProperty.features, feedProperty.featureCategories);
      }

      if (dataChanged) {
        const locationId = await this.findOrCreateLocation(tenantId, feedProperty.location);
        const propertyTypeId = await this.findPropertyTypeId(tenantId, feedProperty.propertyType);
        const featureIds = await this.findFeatureIds(tenantId, feedProperty.features, feedProperty.featureCategories);

        const propertyData: Record<string, any> = {
          reference: feedProperty.reference,
          agentReference: feedProperty.agentReference,
          externalId: feedProperty.externalId,
          source: provider,
          listingType: feedProperty.listingType,
          propertyTypeId,
          locationId,
          title: feedProperty.title,
          description: feedProperty.description,
          price: feedProperty.price,
          priceOnRequest: feedProperty.priceOnRequest || false,
          currency: feedProperty.currency,
          bedrooms: feedProperty.bedrooms,
          bathrooms: feedProperty.bathrooms,
          buildSize: feedProperty.buildSize,
          plotSize: feedProperty.plotSize,
          terraceSize: feedProperty.terraceSize,
          gardenSize: feedProperty.gardenSize,
          features: featureIds,
          lat: feedProperty.lat,
          lng: feedProperty.lng,
          videoUrl: feedProperty.videoUrl,
          virtualTourUrl: feedProperty.virtualTourUrl,
          communityFees: feedProperty.communityFees ?? null,
          ibiFees: feedProperty.ibiFees ?? null,
          basuraTax: feedProperty.basuraTax ?? null,
          builtYear: feedProperty.builtYear ?? null,
          contentHash,
        };

        for (const [key, value] of Object.entries(propertyData)) {
          if (!lockedFields.includes(key)) {
            (updateData as any)[key] = value;
          }
        }
      }

      if (imagesChanged && !lockedFields.includes('images')) {
        updateData.images = await this.processImages(
          tenantId,
          existing.reference,
          feedProperty.images,
          existing.images,
        );
      }

      if (Object.keys(updateData).length === 0) return 'skipped';

      updateData.importedAt = new Date();
      await this.propertyRepository.update(existing.id, updateData);
      return 'updated';
    } else {
      const locationId = await this.findOrCreateLocation(tenantId, feedProperty.location);
      const propertyTypeId = await this.findPropertyTypeId(tenantId, feedProperty.propertyType);
      const featureIds = await this.findFeatureIds(tenantId, feedProperty.features, feedProperty.featureCategories);

      const images = await this.processImages(
        tenantId,
        feedProperty.reference,
        feedProperty.images,
        null,
      );

      const newProperty = this.propertyRepository.create({
        tenantId,
        reference: feedProperty.reference,
        agentReference: feedProperty.agentReference,
        externalId: feedProperty.externalId,
        source: provider as any,
        listingType: feedProperty.listingType,
        propertyTypeId,
        locationId,
        title: feedProperty.title,
        description: feedProperty.description,
        price: feedProperty.price,
        priceOnRequest: feedProperty.priceOnRequest || false,
        currency: feedProperty.currency,
        bedrooms: feedProperty.bedrooms,
        bathrooms: feedProperty.bathrooms,
        buildSize: feedProperty.buildSize,
        plotSize: feedProperty.plotSize,
        terraceSize: feedProperty.terraceSize,
        gardenSize: feedProperty.gardenSize,
        images,
        features: featureIds,
        lat: feedProperty.lat,
        lng: feedProperty.lng,
        videoUrl: feedProperty.videoUrl,
        virtualTourUrl: feedProperty.virtualTourUrl,
        communityFees: feedProperty.communityFees ?? null,
        ibiFees: feedProperty.ibiFees ?? null,
        basuraTax: feedProperty.basuraTax ?? null,
        builtYear: feedProperty.builtYear ?? null,
        contentHash,
        importedAt: new Date(),
        status: 'active',
        isPublished: true,
        publishedAt: new Date(),
      });

      await this.propertyRepository.save(newProperty);
      return 'created';
    }
  }

  private computeFeedHash(feedProperty: FeedProperty): string {
    const { images, ...data } = feedProperty;
    const keys = Object.keys(data).sort();
    const sorted = JSON.stringify(data, keys);
    return createHash('sha256').update(sorted).digest('hex');
  }

  private haveImagesChanged(
    feedImages: FeedPropertyImage[],
    existingImages: PropertyImage[] | null,
  ): boolean {
    if (!existingImages) return feedImages.length > 0;
    if (feedImages.length !== existingImages.length) return true;

    const existingSourceUrls = new Set(
      existingImages.map((img) => img.sourceUrl || img.url),
    );
    return feedImages.some((img) => !existingSourceUrls.has(img.url));
  }

  // Branches on tenant.feedImagesToR2:
  //   OFF (default): keep the provider's CDN URL — no download, no R2.
  //   ON: download from CDN → re-encode to WebP → push to R2 with
  //       content-hash deduplication. Identical bytes across listings
  //       (or across feed re-syncs) consume one R2 object total.
  //
  // Either way, orphans from a previous run (images no longer in the
  // feed) are released so refcount tracks reality.
  private async processImages(
    tenantId: number,
    _propertyRef: string,
    feedImages: FeedPropertyImage[],
    existingImages: PropertyImage[] | null,
  ): Promise<PropertyImage[]> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      select: ['id', 'feedImagesToR2'],
    });
    const downloadToR2 = !!tenant?.feedImagesToR2;

    const existingMap = new Map<string, PropertyImage>();
    if (existingImages) {
      for (const img of existingImages) {
        existingMap.set(img.sourceUrl || img.url, img);
      }
    }
    const newSourceUrls = new Set(feedImages.map((img) => img.url));

    const result: PropertyImage[] = [];
    if (downloadToR2) {
      const CONCURRENCY = 5;
      for (let i = 0; i < feedImages.length; i += CONCURRENCY) {
        const batch = feedImages.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (feedImg): Promise<PropertyImage> => {
            const cached = existingMap.get(feedImg.url);
            if (cached?.contentHash) {
              return { ...cached, order: feedImg.order, alt: feedImg.alt };
            }
            try {
              const stored = await this.uploadService.downloadAndStoreFeedImage(
                tenantId,
                feedImg.url,
              );
              if (!stored) {
                return {
                  url: feedImg.url,
                  sourceUrl: feedImg.url,
                  order: feedImg.order,
                  alt: feedImg.alt,
                };
              }
              return {
                url: stored.url,
                sourceUrl: feedImg.url,
                contentHash: stored.contentHash,
                order: feedImg.order,
                alt: feedImg.alt,
              };
            } catch (err) {
              this.logger.warn(
                `Feed image download failed for ${feedImg.url}: ${(err as Error).message}`,
              );
              // Fall back to provider URL so the property isn't image-less.
              return {
                url: feedImg.url,
                sourceUrl: feedImg.url,
                order: feedImg.order,
                alt: feedImg.alt,
              };
            }
          }),
        );
        result.push(...batchResults);
      }
    } else {
      for (const feedImg of feedImages) {
        result.push({
          url: feedImg.url,
          sourceUrl: feedImg.url,
          order: feedImg.order,
          alt: feedImg.alt,
        });
      }
    }

    // Release orphaned blobs from previous syncs. Safe no-op when there
    // are no contentHashes (the toggle was OFF then, or this is a first
    // import).
    const config = await this.uploadService.getStorageConfig(tenantId);
    for (const [sourceUrl, img] of existingMap) {
      if (!newSourceUrls.has(sourceUrl) && img.contentHash) {
        await this.uploadService
          .releaseBlob(tenantId, img.contentHash, config)
          .catch((err) =>
            this.logger.warn(
              `Failed to releaseBlob for orphan ${img.contentHash}: ${(err as Error).message}`,
            ),
          );
      }
    }

    return result;
  }

  // Builds (or attaches) a Region → Province → Area → Municipality → Town →
  // Urbanization chain. Returns the leaf id (deepest available level).
  // Region and Urbanization are usually absent in feeds — AI enrichment fills
  // Region from the province; Urbanization is manual-only.
  // Same-name children under different parents are kept distinct via the
  // (tenantId, parentId, slug) unique index.
  private async findOrCreateLocation(
    tenantId: number,
    location: FeedProperty['location'],
  ): Promise<number | null> {
    const region = (location.region || '').trim();
    const province = (location.province || '').trim();
    const area = (location.area || '').trim();
    const municipality = (location.municipality || '').trim();
    const town = (location.town || '').trim();
    const urbanization = (location.urbanization || '').trim();

    const steps: Array<{ name: string; level: 'region' | 'province' | 'area' | 'municipality' | 'town' | 'urbanization' }> = [];
    if (region) steps.push({ name: region, level: 'region' });
    if (province) steps.push({ name: province, level: 'province' });
    if (area && area.toLowerCase() !== province.toLowerCase()) {
      steps.push({ name: area, level: 'area' });
    }
    if (municipality && municipality.toLowerCase() !== area.toLowerCase()) {
      steps.push({ name: municipality, level: 'municipality' });
    }
    if (town && town.toLowerCase() !== municipality.toLowerCase()) {
      steps.push({ name: town, level: 'town' });
    }
    if (urbanization && urbanization.toLowerCase() !== town.toLowerCase()) {
      steps.push({ name: urbanization, level: 'urbanization' });
    }

    if (steps.length === 0) return null;

    let parentId: number | null = null;
    let leafId: number | null = null;

    for (const step of steps) {
      const slug = this.slugify(step.name);
      // Scoped lookup: same slug can exist under different parents.
      let node = await this.locationRepository.findOne({
        where: { tenantId, slug, parentId: parentId as any },
      });

      if (!node) {
        node = await this.locationRepository.save(
          this.locationRepository.create({
            tenantId,
            name: { en: step.name, es: step.name },
            slug,
            level: step.level,
            parentId,
            externalId: step.level === steps[steps.length - 1].level ? location.externalId : null,
          }),
        );
      }
      // No parentId backfill — the lookup already matched on parentId, so
      // existing nodes are by definition correctly parented.

      parentId = node.id;
      leafId = node.id;
    }

    return leafId;
  }

  private async findPropertyTypeId(
    tenantId: number,
    typeName: string,
  ): Promise<number | null> {
    if (!typeName || typeName === 'Unknown') return null;

    const slug = this.slugify(typeName);
    const existing = await this.propertyTypeRepository.findOne({
      where: { tenantId, slug },
    });
    if (existing) return existing.id;

    const created = this.propertyTypeRepository.create({
      tenantId,
      name: { en: typeName, es: typeName },
      slug,
    });
    const saved = await this.propertyTypeRepository.save(created);
    return saved.id;
  }

  private async findFeatureIds(
    tenantId: number,
    featureNames: string[],
    categoryMap: Record<string, string> = {},
  ): Promise<number[]> {
    if (!featureNames.length) return [];

    const features = await this.featureRepository.find({
      where: { tenantId },
    });

    const featureMap = new Map<string, typeof features[number]>();
    for (const f of features) {
      const enName = (f.name.en || '').toLowerCase();
      if (enName) featureMap.set(enName, f);
    }

    const resolved: number[] = [];
    const toCreate: string[] = [];

    for (const name of featureNames) {
      const key = name.toLowerCase();
      const existing = featureMap.get(key);
      const hintedCategory = categoryMap[key];

      if (existing) {
        resolved.push(existing.id);
        // Upgrade existing 'other' → real category when feed provides a hint.
        if (hintedCategory && hintedCategory !== 'other' && existing.category === 'other') {
          await this.featureRepository.update(existing.id, { category: hintedCategory as any });
          existing.category = hintedCategory as any;
        }
      } else if (!toCreate.includes(name)) {
        toCreate.push(name);
      }
    }

    for (const name of toCreate) {
      const category = categoryMap[name.toLowerCase()] || 'other';
      const created = this.featureRepository.create({
        tenantId,
        name: { en: name, es: name },
        category: category as any,
      });
      const saved = await this.featureRepository.save(created);
      resolved.push(saved.id);
      featureMap.set(name.toLowerCase(), saved);
    }

    return resolved;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async getImportLogs(tenantId: number, configId?: number): Promise<FeedImportLog[]> {
    const where: any = { tenantId };
    if (configId) {
      where.feedConfigId = configId;
    }

    return this.importLogRepository.find({
      where,
      order: { startedAt: 'DESC' },
      take: 50,
    });
  }

  async getSyncStatus(tenantId: number, configId: number) {
    const config = await this.findConfigById(tenantId, configId);
    const latest = await this.importLogRepository.findOne({
      where: { tenantId, feedConfigId: configId },
      order: { startedAt: 'DESC' },
    });

    if (!latest) {
      return { isRunning: false, totalFetched: 0, targetCount: 0, status: null, startedAt: null };
    }

    return {
      isRunning: latest.status === 'running',
      status: latest.status,
      totalFetched: latest.totalFetched,
      createdCount: latest.createdCount,
      updatedCount: latest.updatedCount,
      skippedCount: latest.skippedCount,
      errorCount: latest.errorCount,
      startedAt: latest.startedAt,
      completedAt: latest.completedAt,
      // Best-effort target: last successful sync's count gives a rough total to render percentage
      targetCount: config.lastSyncCount || 0,
    };
  }
}
