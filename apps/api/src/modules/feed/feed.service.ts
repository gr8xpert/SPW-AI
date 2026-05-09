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
import { Property, PropertyImage, Location, PropertyType, Feature } from '../../database/entities';
import { CreateFeedConfigDto, UpdateFeedConfigDto } from './dto';
import { ResalesAdapter, InmobaAdapter, KyeroAdapter, OdooAdapter, BaseFeedAdapter, FeedProperty, FeedPropertyImage } from './adapters';
import { TenantService } from '../tenant/tenant.service';
import { UploadService } from '../upload/upload.service';

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
    @InjectQueue('feed-import')
    private feedImportQueue: Queue,
    private resalesAdapter: ResalesAdapter,
    private inmobaAdapter: InmobaAdapter,
    private kyeroAdapter: KyeroAdapter,
    private odooAdapter: OdooAdapter,
    private readonly tenantService: TenantService,
    private readonly uploadService: UploadService,
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

      if (!dataChanged && !imagesChanged) return 'skipped';

      const lockedFields = existing.lockedFields || [];
      const updateData: Partial<Property> = {};

      if (dataChanged) {
        const locationId = await this.findOrCreateLocation(tenantId, feedProperty.location);
        const propertyTypeId = await this.findPropertyTypeId(tenantId, feedProperty.propertyType);
        const featureIds = await this.findFeatureIds(tenantId, feedProperty.features);

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
      const featureIds = await this.findFeatureIds(tenantId, feedProperty.features);

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
        contentHash,
        importedAt: new Date(),
        status: 'draft',
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

  // Feed images: keep the provider's CDN URL as-is. We do NOT re-host
  // images that come from a feed — the provider already serves them and
  // re-hosting wastes bandwidth + R2 storage. R2 is reserved for
  // client-uploaded images (handled in UploadService.uploadFile).
  //
  // If a property previously had R2-hosted images (from before this
  // policy change), they're cleaned up here when no longer in the feed.
  private async processImages(
    tenantId: number,
    _propertyRef: string,
    feedImages: FeedPropertyImage[],
    existingImages: PropertyImage[] | null,
  ): Promise<PropertyImage[]> {
    const existingMap = new Map<string, PropertyImage>();
    if (existingImages) {
      for (const img of existingImages) {
        existingMap.set(img.sourceUrl || img.url, img);
      }
    }

    const newSourceUrls = new Set(feedImages.map((img) => img.url));

    const result: PropertyImage[] = feedImages.map((feedImg) => ({
      url: feedImg.url,
      sourceUrl: feedImg.url,
      order: feedImg.order,
      alt: feedImg.alt,
    }));

    // Best-effort cleanup of any orphaned R2 objects from before the
    // "keep CDN URL" policy. Safe no-op for new tenants whose feed
    // images were never in R2.
    for (const [sourceUrl, img] of existingMap) {
      if (!newSourceUrls.has(sourceUrl) && img.sourceUrl) {
        const key = this.uploadService.extractR2Key(img.url, tenantId);
        if (key) {
          this.uploadService.deleteFeedImage(tenantId, key).catch(() => {});
        }
      }
    }

    return result;
  }

  private async findOrCreateLocation(
    tenantId: number,
    location: FeedProperty['location'],
  ): Promise<number | null> {
    if (!location.name) return null;

    const existing = await this.locationRepository.findOne({
      where: {
        tenantId,
        slug: this.slugify(location.name),
      },
    });

    if (existing) return existing.id;

    const newLocation = this.locationRepository.create({
      tenantId,
      name: { en: location.name, es: location.name },
      slug: this.slugify(location.name),
      level: 'town',
      externalId: location.externalId,
    });

    const saved = await this.locationRepository.save(newLocation);
    return saved.id;
  }

  private async findPropertyTypeId(
    tenantId: number,
    typeName: string,
  ): Promise<number | null> {
    if (!typeName) return null;

    const existing = await this.propertyTypeRepository.findOne({
      where: { tenantId, slug: this.slugify(typeName) },
    });

    return existing?.id || null;
  }

  private async findFeatureIds(
    tenantId: number,
    featureNames: string[],
  ): Promise<number[]> {
    if (!featureNames.length) return [];

    const features = await this.featureRepository.find({
      where: { tenantId },
    });

    const featureMap = new Map<string, number>();
    for (const f of features) {
      const enName = (f.name.en || '').toLowerCase();
      featureMap.set(enName, f.id);
    }

    return featureNames
      .map((name) => featureMap.get(name.toLowerCase()))
      .filter((id): id is number => id !== undefined);
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
}
