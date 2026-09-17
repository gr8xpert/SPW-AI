import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { FeedConfig, FeedImportLog, ImportError } from '../../database/entities';
import type { FeedCredentials } from '../../database/entities/feed-config.entity';
import { Property, PropertyImage, Location, PropertyType, Feature, Tenant } from '../../database/entities';
import { CreateFeedConfigDto, UpdateFeedConfigDto } from './dto';
import { ResalesAdapter, InmobaAdapter, KyeroAdapter, OdooAdapter, BaseFeedAdapter, FeedProperty, FeedPropertyImage } from './adapters';
import { TenantService } from '../tenant/tenant.service';
import { UploadService } from '../upload/upload.service';
import { AiEnrichmentService } from '../ai-enrichment/ai-enrichment.service';
import { isValidCronExpression } from './cron-validator';
import { DEFAULT_AREA_PROVINCE } from '@spm/shared';

// Listings that left a feed are only removed after a run that received at
// least this share of the total the feed reported...
const FEED_COMPLETE_RUN_RATIO = 0.95;
// ...and never when one run would remove more than this share of the feed's
// properties (and more than FEED_MASS_REMOVAL_MIN of them).
const FEED_MASS_REMOVAL_RATIO = 0.3;
const FEED_MASS_REMOVAL_MIN = 20;

interface FeedOwnershipContext {
  liveFeedIds: Set<number>;
  featuredFeedIds: Set<number>;
}

// Returns a credentials object safe to send to API consumers — secret fields
// are reduced to a "last 4 chars" hint so the dashboard can re-render the
// configured state without exposing the underlying value.
function maskFeedCredentials(creds: FeedCredentials | null | undefined): FeedCredentials {
  if (!creds) return {};
  const masked: FeedCredentials = { ...creds };
  for (const key of ['apiKey', 'password'] as const) {
    const value = masked[key];
    if (typeof value === 'string' && value.length > 0) {
      masked[key] = value.length > 4
        ? '••••' + value.slice(-4)
        : '••••';
    }
  }
  return masked;
}

function maskedFeedConfig(config: FeedConfig): FeedConfig {
  return { ...config, credentials: maskFeedCredentials(config.credentials) };
}

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
    const configs = await this.feedConfigRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return configs.map(maskedFeedConfig);
  }

  async findConfigById(tenantId: number, id: number): Promise<FeedConfig> {
    const config = await this.feedConfigRepository.findOne({
      where: { id, tenantId },
    });

    if (!config) {
      throw new NotFoundException('Feed config not found');
    }

    return maskedFeedConfig(config);
  }

  // Internal-only accessor used by the import worker and adapters. Returns the
  // full decrypted credentials object. NEVER pass the result to a controller —
  // dashboard-facing reads must go through findConfigById / findAllConfigs which
  // mask secrets.
  private async findConfigWithCredentials(tenantId: number, id: number): Promise<FeedConfig> {
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

    // Validate cron expression at save time so a typo doesn't silently fall
    // through to the scheduler's 24h fallback.
    if (dto.syncSchedule && !isValidCronExpression(dto.syncSchedule)) {
      throw new BadRequestException({
        message: 'syncSchedule is not a valid cron expression',
        code: 'INVALID_CRON',
        value: dto.syncSchedule,
      });
    }

    const config = this.feedConfigRepository.create({
      ...dto,
      tenantId,
    });

    const saved = await this.feedConfigRepository.save(config);
    return maskedFeedConfig(saved);
  }

  async updateConfig(
    tenantId: number,
    id: number,
    dto: UpdateFeedConfigDto,
  ): Promise<FeedConfig> {
    const config = await this.findConfigWithCredentials(tenantId, id);

    if (dto.credentials) {
      // Dashboard re-saves typically send back the masked values we returned
      // ("••••abcd"). Preserve the existing stored value for any field whose
      // incoming value still contains the mask sentinel, so unedited fields
      // don't get clobbered to "••••abcd" on disk.
      const merged: FeedCredentials = { ...(config.credentials || {}) };
      for (const [key, value] of Object.entries(dto.credentials) as Array<[keyof FeedCredentials, string | undefined]>) {
        if (typeof value === 'string' && value.includes('••••')) continue;
        merged[key] = value;
      }
      dto.credentials = merged;

      const adapter = this.getAdapter(config.provider);
      const result = await adapter.validateCredentials(merged);

      if (!result.valid) {
        throw new BadRequestException(result.error || 'Invalid feed credentials');
      }
    }

    if (dto.syncSchedule && !isValidCronExpression(dto.syncSchedule)) {
      throw new BadRequestException({
        message: 'syncSchedule is not a valid cron expression',
        code: 'INVALID_CRON',
        value: dto.syncSchedule,
      });
    }

    const featuredSwitchedOff = config.markAsFeatured && dto.markAsFeatured === false;

    Object.assign(config, dto);
    const saved = await this.feedConfigRepository.save(config);

    if (featuredSwitchedOff) {
      await this.releaseFeaturedFlags(tenantId, id);
    }
    return maskedFeedConfig(saved);
  }

  async deleteConfig(tenantId: number, id: number): Promise<void> {
    const config = await this.findConfigById(tenantId, id);
    await this.releaseFeaturedFlags(tenantId, id);
    await this.feedConfigRepository.remove(config);
  }

  // Unfeatures every listing a markAsFeatured feed flagged. `onlyIds` narrows
  // it to listings that left the feed; omitted, it releases all of them (the
  // option was switched off or the feed deleted). Hand-set featured flags
  // (featuredByFeedId NULL) are never touched.
  private async releaseFeaturedFlags(
    tenantId: number,
    feedConfigId: number,
    onlyIds?: number[],
  ): Promise<number> {
    if (onlyIds && onlyIds.length === 0) return 0;
    let released = 0;
    const ids = onlyIds ?? null;
    const chunks: Array<number[] | null> = [];
    if (ids) {
      for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
    } else {
      chunks.push(null);
    }
    for (const chunk of chunks) {
      const where: any = { tenantId, featuredByFeedId: feedConfigId };
      if (chunk) where.id = In(chunk);
      const res = await this.propertyRepository.update(where, {
        isFeatured: false,
        featuredByFeedId: null,
      });
      released += res.affected ?? 0;
    }
    return released;
  }

  // `scheduledWindow` is supplied by the scheduler (hour bucket like 2026051310).
  // When present, the BullMQ jobId is deterministic — duplicate scheduler ticks
  // across replicas collapse to a single queued job. When absent (manual
  // dashboard trigger), a unique jobId is generated so the operator can re-run
  // even within the same window.
  async triggerSync(
    tenantId: number,
    configId: number,
    options?: { scheduledWindow?: string },
  ): Promise<FeedImportLog> {
    const config = await this.findConfigWithCredentials(tenantId, configId);

    // Refuse to start a second import while one is already running for the
    // same tenant/config. The window-aware caller (scheduler) already collapses
    // duplicate ticks via the deterministic jobId, but a manual operator click
    // followed by a scheduler tick still needs catching here.
    const running = await this.importLogRepository.findOne({
      where: { feedConfigId: config.id, tenantId: config.tenantId, status: 'running' },
      order: { id: 'DESC' },
    });
    if (running) {
      const ageMs = Date.now() - new Date(running.startedAt).getTime();
      // A run that's been "running" for >2h is almost certainly a worker that
      // died without writing back. We surface that as a regular start so a
      // jammed import isn't permanent — the scheduler/operator can move forward.
      const STALE_MS = 2 * 60 * 60 * 1000;
      if (ageMs < STALE_MS) {
        this.logger.log(
          `Refusing duplicate triggerSync for config=${config.id} (existing running log #${running.id}, age=${ageMs}ms)`,
        );
        return running;
      }
      this.logger.warn(
        `Found stale running log #${running.id} for config=${config.id} (age=${ageMs}ms); marking failed and continuing`,
      );
      running.status = 'failed';
      running.completedAt = new Date();
      running.errors = [{ ref: 'system', error: 'stale running log — superseded' }];
      await this.importLogRepository.save(running);
    }

    const importLog = this.importLogRepository.create({
      feedConfigId: config.id,
      tenantId: config.tenantId,
      startedAt: new Date(),
      status: 'running',
    });

    await this.importLogRepository.save(importLog);

    const jobId = options?.scheduledWindow
      ? `feed-import:${config.id}:${options.scheduledWindow}`
      : `feed-import:${config.id}:${importLog.id}`;

    await this.feedImportQueue.add(
      'import',
      {
        configId: config.id,
        importLogId: importLog.id,
        tenantId,
      },
      { jobId },
    );

    return importLog;
  }

  // Destructive: nukes every location for this tenant, then re-imports from the
  // feed. Use this after a hierarchy/mapping fix so the chain rebuilds cleanly
  // instead of mixing old + new rows. property.locationId is set to NULL first
  // (so the FK doesn't block) and the next import re-attaches each property to
  // its newly-built location chain.
  async wipeLocationsAndSync(
    tenantId: number,
    configId: number,
  ): Promise<{ wiped: number; importLog: FeedImportLog }> {
    const config = await this.findConfigById(tenantId, configId);

    const beforeCount = await this.locationRepository.count({ where: { tenantId } });

    // FK-safe wipe scoped to this tenant. Disable FK checks for the wipe so
    // the self-referential parentId cascade doesn't slow this down on tenants
    // with thousands of rows.
    const qr = this.locationRepository.manager.connection.createQueryRunner();
    try {
      await qr.connect();
      await qr.query('UPDATE properties SET locationId = NULL WHERE tenantId = ? AND locationId IS NOT NULL', [tenantId]);
      await qr.query('SET FOREIGN_KEY_CHECKS = 0');
      await qr.query('DELETE FROM locations WHERE tenantId = ?', [tenantId]);
      await qr.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
      await qr.release();
    }

    this.logger.log(`Wiped ${beforeCount} locations for tenant=${tenantId}, triggering re-import`);

    const importLog = await this.triggerSync(tenantId, config.id);
    return { wiped: beforeCount, importLog };
  }

  // Delete every property that was imported by this feed, then garbage-collect
  // any locations / property types / features that are no longer referenced by
  // ANY remaining property for this tenant. Shared taxonomy rows still used by
  // other feeds or manual listings are preserved.
  //
  // Also releases R2 image blobs held by the deleted properties so storage
  // reflects reality.
  //
  // This does NOT delete the feed config itself — operator can re-sync fresh
  // from the same config after wiping. To also drop the feed, call deleteConfig.
  async wipeFeedData(
    tenantId: number,
    configId: number,
  ): Promise<{ propertiesDeleted: number; locationsDeleted: number; propertyTypesDeleted: number; featuresDeleted: number }> {
    // Validate the config exists and belongs to this tenant.
    await this.findConfigById(tenantId, configId);

    // Snapshot properties we're about to delete so we can release image blobs
    // (R2 refcount cleanup) before the row is gone.
    const doomed = await this.propertyRepository.find({
      where: { tenantId, feedConfigId: configId },
      select: ['id', 'images'],
    });
    const propertiesDeleted = doomed.length;

    if (propertiesDeleted === 0) {
      return { propertiesDeleted: 0, locationsDeleted: 0, propertyTypesDeleted: 0, featuresDeleted: 0 };
    }

    // Release R2 blobs held by images we're deleting.
    await this.releasePropertyImages(tenantId, doomed, 'wipeFeedData');

    // Delete in one shot — FK relations to locationId / propertyTypeId are
    // ON DELETE SET NULL on the *other* direction, so we don't need to null
    // properties out first.
    await this.propertyRepository.delete({ tenantId, feedConfigId: configId });

    // ===== Orphan-GC =====

    // 1) Property types: delete any type for this tenant that no surviving
    //    property still references.
    const orphanTypes = await this.propertyTypeRepository
      .createQueryBuilder('pt')
      .leftJoin('properties', 'p', 'p.propertyTypeId = pt.id AND p.tenantId = pt.tenantId')
      .where('pt.tenantId = :tenantId', { tenantId })
      .andWhere('p.id IS NULL')
      .select('pt.id', 'id')
      .getRawMany();
    const orphanTypeIds = orphanTypes.map((r) => Number(r.id)).filter(Boolean);
    let propertyTypesDeleted = 0;
    if (orphanTypeIds.length > 0) {
      // Detach children first so we don't hit a FK error on parentId.
      await this.propertyTypeRepository
        .createQueryBuilder()
        .update()
        .set({ parentId: null })
        .whereInIds(orphanTypeIds)
        .orWhere('parentId IN (:...ids)', { ids: orphanTypeIds })
        .execute()
        .catch(() => undefined);
      const res = await this.propertyTypeRepository.delete(orphanTypeIds);
      propertyTypesDeleted = res.affected || 0;
    }

    // 2) Locations: delete any location for this tenant that no surviving
    //    property references. Detach parent links first so leaves can go
    //    before their parents without FK errors.
    const orphanLocs = await this.locationRepository
      .createQueryBuilder('l')
      .leftJoin('properties', 'p', 'p.locationId = l.id AND p.tenantId = l.tenantId')
      .where('l.tenantId = :tenantId', { tenantId })
      .andWhere('p.id IS NULL')
      .select('l.id', 'id')
      .getRawMany();
    const orphanLocIds = orphanLocs.map((r) => Number(r.id)).filter(Boolean);
    let locationsDeleted = 0;
    if (orphanLocIds.length > 0) {
      const qr = this.locationRepository.manager.connection.createQueryRunner();
      try {
        await qr.connect();
        await qr.query('SET FOREIGN_KEY_CHECKS = 0');
        const placeholders = orphanLocIds.map(() => '?').join(',');
        await qr.query(`DELETE FROM locations WHERE id IN (${placeholders})`, orphanLocIds);
        await qr.query('SET FOREIGN_KEY_CHECKS = 1');
      } finally {
        await qr.release();
      }
      locationsDeleted = orphanLocIds.length;
    }

    // 3) Features: property.features is JSON int[]. Collect every feature id
    //    still referenced by any surviving property for this tenant, then
    //    delete features NOT IN that set.
    const remainingProps = await this.propertyRepository.find({
      where: { tenantId },
      select: ['features'],
    });
    const referencedFeatureIds = new Set<number>();
    for (const p of remainingProps) {
      if (Array.isArray(p.features)) {
        for (const fid of p.features) {
          if (typeof fid === 'number') referencedFeatureIds.add(fid);
        }
      }
    }
    const allFeatures = await this.featureRepository.find({
      where: { tenantId },
      select: ['id'],
    });
    const orphanFeatureIds = allFeatures
      .map((f) => f.id)
      .filter((id) => !referencedFeatureIds.has(id));
    let featuresDeleted = 0;
    if (orphanFeatureIds.length > 0) {
      const res = await this.featureRepository.delete(orphanFeatureIds);
      featuresDeleted = res.affected || 0;
    }

    // Widget/property caches point at deleted rows — invalidate.
    try {
      await this.tenantService.clearCache(tenantId, { reason: `feed_wipe:config=${configId}` });
    } catch (err) {
      this.logger.warn(
        `wipeFeedData: cache clear failed for tenant=${tenantId}: ${(err as Error).message}`,
      );
    }

    this.logger.log(
      `wipeFeedData tenant=${tenantId} config=${configId}: ` +
        `properties=${propertiesDeleted}, locations=${locationsDeleted}, ` +
        `propertyTypes=${propertyTypesDeleted}, features=${featuresDeleted}`,
    );

    return { propertiesDeleted, locationsDeleted, propertyTypesDeleted, featuresDeleted };
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

    // Canonical Area → Province map, read once per run rather than per property.
    // Keys are area slugs, values province names — see TenantSettings
    // .locationAreaProvince for why this exists.
    const tenant = await this.tenantRepository.findOne({
      where: { id: config.tenantId },
      select: ['id', 'settings'],
    });
    const areaProvinceOverrides = this.normalizeAreaProvinceOverrides(
      tenant?.settings?.locationAreaProvince,
    );

    let totalFetched = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let removedCount = 0;
    // Largest total the feed reported, to tell a complete run from one that
    // silently came back short before removing anything.
    let reportedTotal = 0;
    let page = 1;
    let hasMore = true;
    // The tenant's feeds decide who owns a property (see importProperty), and
    // ownership decides which feed may remove it.
    const tenantFeeds = await this.feedConfigRepository.find({
      where: { tenantId: config.tenantId },
      select: ['id', 'provider', 'markAsFeatured'],
    });
    const ownership: FeedOwnershipContext = {
      liveFeedIds: new Set(tenantFeeds.map((f) => f.id)),
      featuredFeedIds: new Set(tenantFeeds.filter((f) => f.markAsFeatured).map((f) => f.id)),
    };
    // Every listing the feed returned this run — a markAsFeatured feed
    // unfeatures whatever it flagged earlier that isn't in here.
    const seenExternalIds = new Set<string>();

    try {
      while (hasMore) {
        const result = await adapter.fetchProperties(config.credentials, page, 100);

        totalFetched += result.properties.length;
        reportedTotal = Math.max(reportedTotal, result.totalCount || 0);

        for (const feedProperty of result.properties) {
          seenExternalIds.add(String(feedProperty.externalId));
          try {
            const outcome = await this.importProperty(
              config.tenantId,
              config.id,
              config.provider,
              feedProperty,
              config.fieldMapping,
              config.protectedFields || [],
              areaProvinceOverrides,
              config.markAsFeatured === true,
              ownership,
            );

            if (outcome === 'created') {
              createdCount++;
            } else if (outcome === 'updated') {
              updatedCount++;
            } else {
              skippedCount++;
            }
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

        // An empty page always ends the run, so an adapter that misjudges
        // hasMore can't loop forever.
        hasMore = result.hasMore && result.properties.length > 0;
        page++;
      }

      // Only after the whole feed was paged through: a run that died half way
      // would otherwise unfeature everything on the pages it never reached.
      // An empty result is treated the same way — more likely an API hiccup
      // than the agency emptying its featured list.
      if (config.markAsFeatured && totalFetched > 0) {
        const flagged = await this.propertyRepository.find({
          where: { tenantId: config.tenantId, featuredByFeedId: config.id },
          select: ['id', 'externalId'],
        });
        const departed = flagged
          .filter((p) => !seenExternalIds.has(String(p.externalId)))
          .map((p) => p.id);
        const released = await this.releaseFeaturedFlags(config.tenantId, config.id, departed);
        if (released > 0) {
          updatedCount += released;
          this.logger.log(
            `Unfeatured ${released} properties no longer in featured feed ${config.id} (tenant=${config.tenantId})`,
          );
        }
      }

      // Mirror the source: listings that left the feed (sold, withdrawn) go.
      // A featured feed leaves this to an ordinary feed of the same source when
      // there is one: leaving the featured list doesn't mean leaving the market.
      const removalHandledElsewhere =
        config.markAsFeatured &&
        tenantFeeds.some((f) => f.id !== config.id && !f.markAsFeatured && f.provider === config.provider);
      if (config.removeMissing !== false && !removalHandledElsewhere) {
        const removal = await this.removeListingsNoLongerInFeed(config, seenExternalIds, reportedTotal);
        removedCount = removal.removed;
        if (removal.skippedReason) {
          errors.push({ ref: 'removal', error: removal.skippedReason });
          this.logger.warn(`Feed ${config.id} (tenant=${config.tenantId}): ${removal.skippedReason}`);
        }
      }

      importLog.status = errors.length > 0 ? 'partial' : 'success';
      importLog.completedAt = new Date();
      importLog.removedCount = removedCount;
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

      if (createdCount > 0 || updatedCount > 0 || removedCount > 0) {
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

  // Deletes the properties this feed owns that a complete run did not return,
  // so the site mirrors the source. Called only after every page was fetched
  // without error. Properties with "Enable Feed Sync" off are always kept.
  private async removeListingsNoLongerInFeed(
    config: FeedConfig,
    seenExternalIds: Set<string>,
    reportedTotal: number,
  ): Promise<{ removed: number; skippedReason?: string }> {
    if (seenExternalIds.size === 0) {
      return { removed: 0, skippedReason: 'Removal skipped: the feed returned no properties.' };
    }
    // Listings added or withdrawn while paging can shift a few between pages,
    // but a run that saw clearly fewer than the feed reported is incomplete.
    if (reportedTotal > 0 && seenExternalIds.size < reportedTotal * FEED_COMPLETE_RUN_RATIO) {
      return {
        removed: 0,
        skippedReason: `Removal skipped: received ${seenExternalIds.size} of ${reportedTotal} properties the feed reported.`,
      };
    }

    const owned = await this.propertyRepository.find({
      where: { tenantId: config.tenantId, feedConfigId: config.id, source: config.provider as any },
      select: ['id', 'externalId', 'images', 'syncEnabled'],
    });
    const departed = owned.filter(
      (p) => p.syncEnabled !== false && !!p.externalId && !seenExternalIds.has(String(p.externalId)),
    );
    if (departed.length === 0) return { removed: 0 };

    // A daily sync losing a large share at once is far more likely a changed
    // filter or a source-side fault than that many sales.
    if (departed.length > FEED_MASS_REMOVAL_MIN && departed.length > owned.length * FEED_MASS_REMOVAL_RATIO) {
      return {
        removed: 0,
        skippedReason:
          `Removal skipped: ${departed.length} of ${owned.length} properties would be removed at once. ` +
          `Check the feed's filter, or switch off "Remove properties that leave this feed" to keep them.`,
      };
    }

    await this.releasePropertyImages(config.tenantId, departed, 'removeListingsNoLongerInFeed');
    const ids = departed.map((p) => p.id);
    for (let i = 0; i < ids.length; i += 500) {
      await this.propertyRepository.delete({ tenantId: config.tenantId, id: In(ids.slice(i, i + 500)) });
    }
    this.logger.log(
      `Removed ${ids.length} properties no longer in feed ${config.id} (tenant=${config.tenantId}): ` +
        departed.slice(0, 20).map((p) => p.externalId).join(', ') +
        (departed.length > 20 ? ', ...' : ''),
    );
    return { removed: ids.length };
  }

  // Releases R2 blobs held by the images of properties about to be deleted.
  // Non-fatal per image so one bad blob doesn't block the delete.
  private async releasePropertyImages(
    tenantId: number,
    properties: Array<Pick<Property, 'id' | 'images'>>,
    caller: string,
  ): Promise<void> {
    if (!properties.some((p) => p.images?.some((img) => img.contentHash))) return;
    const storageConfig = await this.uploadService.getStorageConfig(tenantId);
    for (const p of properties) {
      if (!p.images) continue;
      for (const img of p.images) {
        if (!img.contentHash) continue;
        try {
          await this.uploadService.releaseBlob(tenantId, img.contentHash, storageConfig);
        } catch (err) {
          this.logger.warn(
            `${caller}: releaseBlob failed for prop=${p.id} hash=${img.contentHash}: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  private async importProperty(
    tenantId: number,
    feedConfigId: number,
    provider: string,
    feedProperty: FeedProperty,
    fieldMapping: any,
    feedProtectedFields: string[] = [],
    areaProvinceOverrides: Record<string, string> = {},
    markAsFeatured = false,
    ownership?: FeedOwnershipContext,
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
      const hasIncomingLocation = !!(
        feedProperty.location.province ||
        feedProperty.location.area ||
        feedProperty.location.municipality ||
        feedProperty.location.town ||
        feedProperty.location.region ||
        feedProperty.location.urbanization
      );
      const missingLocation = !existing.locationId && hasIncomingLocation;
      // Claim only listings nobody has featured or unfeatured yet: a marker
      // left with isFeatured=false means a user switched it off by hand, and an
      // already-featured listing without a marker was featured by hand.
      const claimFeatured =
        markAsFeatured &&
        !existing.isFeatured &&
        existing.featuredByFeedId == null &&
        !feedProtectedFields.includes('isFeatured') &&
        !(existing.lockedFields || []).includes('isFeatured');
      // The owning feed is the one allowed to remove the row when it leaves.
      // A featured feed lists a subset of another feed's properties, so it
      // never takes a row from another live feed, while an ordinary feed takes
      // rows from a featured one. Rows without a live owner go to whoever sees
      // them; rows of another live ordinary feed stay put so two overlapping
      // feeds don't swap them every run.
      const currentOwner = existing.feedConfigId;
      const claimOwnership =
        currentOwner !== feedConfigId &&
        (!ownership ||
          currentOwner == null ||
          !ownership.liveFeedIds.has(currentOwner) ||
          (ownership.featuredFeedIds.has(currentOwner) && !markAsFeatured));

      if (!dataChanged && !imagesChanged && !promoteFromDraft && !neverPublished && !missingPropertyType && !missingFeatures && !missingLocation && !claimFeatured && !claimOwnership) return 'skipped';

      // Per-property locks (user-edited fields) merged with per-feed protected
      // fields (tenant-wide setting on FeedConfig). Union wins: any field named
      // in either list is skipped by sync.
      const lockedFields = Array.from(
        new Set([...(existing.lockedFields || []), ...feedProtectedFields]),
      );
      const updateData: Partial<Property> = {};

      if (claimFeatured) {
        updateData.isFeatured = true;
        updateData.featuredByFeedId = feedConfigId;
      }

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

      if (missingLocation && !lockedFields.includes('locationId') && !dataChanged) {
        // dataChanged covers location via the full propertyData block below.
        // This branch only fires when feed content is unchanged but the row lost
        // its locationId (e.g. after a wipe-and-sync).
        const locationId = await this.findOrCreateLocation(tenantId, feedProperty.location, areaProvinceOverrides);
        if (locationId !== null) updateData.locationId = locationId;
      }

      if (dataChanged) {
        const locationId = await this.findOrCreateLocation(tenantId, feedProperty.location, areaProvinceOverrides);
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
          energyRating: feedProperty.energyRating ?? null,
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

      // Tag ownership (see claimOwnership) regardless of what else changed, so
      // backfilled-NULL rows and rows of a deleted feed get re-associated with
      // the feed that just touched them. Also lets the per-feed wipe button and
      // listing removal target them cleanly.
      if (claimOwnership) {
        updateData.feedConfigId = feedConfigId;
      }

      if (Object.keys(updateData).length === 0) return 'skipped';

      updateData.importedAt = new Date();
      await this.propertyRepository.update(existing.id, updateData);
      return 'updated';
    } else {
      const locationId = await this.findOrCreateLocation(tenantId, feedProperty.location, areaProvinceOverrides);
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
        feedConfigId,
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
        energyRating: feedProperty.energyRating ?? null,
        contentHash,
        importedAt: new Date(),
        status: 'active',
        isPublished: true,
        publishedAt: new Date(),
        isFeatured: markAsFeatured,
        featuredByFeedId: markAsFeatured ? feedConfigId : null,
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

  // Builds the effective Area → Province map for a tenant: the platform
  // defaults (DEFAULT_AREA_PROVINCE) with that tenant's overrides applied on
  // top. Every Spanish Resales client hits the duplicate-costa problem, so the
  // fix ships as a default and per-tenant config stays the exception.
  //
  // Operators type area names however they like ("Costa Del Sol",
  // "costa-del-sol", " Costa del Sol "), so tenant keys are re-slugified here
  // and matched against the slugified area from the feed.
  //
  // An override with an empty value opts the tenant OUT of a platform default,
  // restoring raw feed behaviour for that area — needed for the client whose
  // feed genuinely is the exception. Non-string values are ignored rather than
  // allowed to blank out a province.
  private normalizeAreaProvinceOverrides(
    raw: Record<string, string> | undefined,
  ): Record<string, string> {
    const out: Record<string, string> = { ...DEFAULT_AREA_PROVINCE };
    if (!raw || typeof raw !== 'object') return out;

    for (const [area, province] of Object.entries(raw)) {
      if (typeof province !== 'string') continue;
      const key = this.slugify(String(area));
      if (!key) continue;
      const value = province.trim();
      if (value) {
        out[key] = value;
      } else {
        // Explicit opt-out of a platform default.
        delete out[key];
      }
    }
    return out;
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
    // Canonical area-slug → province-name map from tenant settings. Passed in
    // rather than fetched here because this runs once per imported property.
    areaProvinceOverrides: Record<string, string> = {},
  ): Promise<number | null> {
    const region = (location.region || '').trim();
    const area = (location.area || '').trim();

    // Feeds describe the hierarchy per property, and Resales sends no ID for
    // Province/Area — only names. A single row saying `Cádiz / Costa del Sol`
    // therefore creates a second "Costa del Sol" under Cádiz next to the real
    // one under Málaga, which then shows up twice in the tree and in widget
    // dropdowns. Rewriting the province here pins the area to one canonical
    // parent regardless of what an individual property claims.
    // Areas with no entry in the map are left exactly as the feed sent them.
    const overrideProvince = area ? areaProvinceOverrides[this.slugify(area)] : undefined;
    const province = (overrideProvince || location.province || '').trim();
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
      removedCount: latest.removedCount ?? 0,
      removalNote: latest.errors?.find((e) => e.ref === 'removal')?.error ?? null,
      startedAt: latest.startedAt,
      completedAt: latest.completedAt,
      // Best-effort target: last successful sync's count gives a rough total to render percentage
      targetCount: config.lastSyncCount || 0,
    };
  }
}
