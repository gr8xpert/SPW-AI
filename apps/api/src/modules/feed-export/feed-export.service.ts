import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { ApiKeyScope } from '@spm/shared';
import {
  ApiKey,
  FeedExportConfig,
  FeedExportLog,
  Property,
  Location,
  PropertyType,
  Feature,
  Tenant,
  ExportFormat,
  ExportListingScope,
  ExportLogFormat,
  ExportLogTrigger,
  JsonFeedSettings,
} from '../../database/entities';
import { UpdateFeedExportConfigDto, UpdateJsonFeedDto } from './dto';
import { PropertySearchService } from '../property/property-search.service';
import { cleanKeyScope } from '../property/key-scope';
import { KyeroFeedWriter } from './kyero/kyero-builder';
import { ExportLookups, joinJsonFeedRows, jsonFeedRow, toExportProperty } from './export-rows';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { UrlFeedRunResult, runUrlFeedOnce } from './manual-run';

// Which listings a URL feed sends. The Kyero XML feed reads these from the
// config's top-level columns, the JSON feed from config.jsonFeed.
interface BuiltFeed {
  content: string;
  contentType: string;
  count: number;
  skipped: number;
}

export interface ListingRules {
  includeUnpublished: boolean;
  includeSold: boolean;
  listingScope: ExportListingScope;
  // The hand-picked listings when listingScope is 'selected'.
  propertyIds?: number[] | null;
  propertyFilter?: Record<string, any> | null;
  // A website key's scope, for that key's own XML feed.
  keyScope?: ApiKeyScope | null;
}

// A website key's XML feed token (Settings -> API Keys). The Kyero export keys start with sk_export_.
// Rows the dashboard shows per log.
const LOG_ROWS = 200;

export const KEY_FEED_PREFIX = 'sk_feed_';

// Listings read per query. A large client has over 11,000, and loading them in
// one go took a process past 1.9 GB, so builds hold one batch at a time.
const FULL_BATCH = 200;

// The JSON feed's settings. Rows saved before it had its own fall back to
// the shared values (the migration copies them; this covers a missed row).
export function jsonFeedOf(config: FeedExportConfig): JsonFeedSettings {
  return {
    enabled: config.jsonFeed?.enabled ?? config.isEnabled,
    includeUnpublished: config.jsonFeed?.includeUnpublished ?? config.includeUnpublished,
    includeSold: config.jsonFeed?.includeSold ?? config.includeSold,
    listingScope: config.jsonFeed?.listingScope ?? config.listingScope ?? 'all',
    propertyIds: config.jsonFeed?.propertyIds ?? [],
    feedKey: config.jsonFeed?.feedKey || config.exportKey,
  };
}

@Injectable()
export class FeedExportService {
  constructor(
    @InjectRepository(FeedExportConfig)
    private configRepository: Repository<FeedExportConfig>,
    @InjectRepository(FeedExportLog)
    private logRepository: Repository<FeedExportLog>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectRepository(Location)
    private locationRepository: Repository<Location>,
    @InjectRepository(PropertyType)
    private typeRepository: Repository<PropertyType>,
    @InjectRepository(Feature)
    private featureRepository: Repository<Feature>,
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    private configService: ConfigService,
    private propertySearch: PropertySearchService,
    private lock: RedisLockService,
  ) {}

  // Feed builds wait their turn in each process: a batch is small, but several
  // finished feeds in memory at once are not.
  private buildTail: Promise<unknown> = Promise.resolve();

  oneBuildAtATime<T>(build: () => Promise<T>): Promise<T> {
    const run = this.buildTail.then(build);
    this.buildTail = run.catch(() => undefined);
    return run;
  }

  // ============ Config Management ============
  // `apiKey` / `tenantSlug` are what the dashboard page reads to show the key
  // and build the feed URLs. The row (and key) is created on first visit so
  // the page always has a real URL to show.
  async getConfig(tenantId: number) {
    const config = await this.ensureConfig(tenantId);
    const json = jsonFeedOf(config);
    const jsonRules = { ...json, propertyFilter: config.propertyFilter };
    // The Kyero XML feed lives in Feed Export -> Feeds now (export_feeds).
    const [tenant, jsonCount] = await Promise.all([
      this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'slug'] }),
      this.listingQuery(tenantId, jsonRules, 'json').then((q) => q.getCount()),
    ]);
    const { jsonFeed: _stored, ...rest } = config;
    return {
      ...rest,
      apiKey: config.exportKey,
      json: {
        enabled: json.enabled,
        includeUnpublished: json.includeUnpublished,
        includeSold: json.includeSold,
        listingScope: json.listingScope,
        propertyIds: json.propertyIds,
        apiKey: json.feedKey,
        propertyCount: jsonCount,
      },
      tenantSlug: tenant?.slug ?? '',
    };
  }

  // The client's config row, created (with a fresh export key) on first use.
  async ensureConfig(tenantId: number): Promise<FeedExportConfig> {
    const existing = await this.configRepository.findOne({ where: { tenantId } });
    if (existing) return existing;
    return this.configRepository.save(
      this.configRepository.create({ tenantId, exportKey: this.generateExportKey() }),
    );
  }

  async createOrUpdateConfig(
    tenantId: number,
    dto: UpdateFeedExportConfigDto,
  ): Promise<FeedExportConfig> {
    let config = await this.configRepository.findOne({ where: { tenantId } });

    if (config) {
      Object.assign(config, dto);
    } else {
      config = this.configRepository.create({
        ...dto,
        tenantId,
        exportKey: this.generateExportKey(),
      });
    }

    return this.configRepository.save(config);
  }

  // The Kyero XML key. The JSON feed is pinned to its current key first, so a
  // row still on the shared key doesn't lose its JSON URL along with Kyero's.
  async regenerateKey(tenantId: number): Promise<FeedExportConfig> {
    const config = await this.ensureConfig(tenantId);
    config.jsonFeed = jsonFeedOf(config);
    config.exportKey = this.generateExportKey();
    return this.configRepository.save(config);
  }

  async updateJsonFeed(tenantId: number, dto: UpdateJsonFeedDto): Promise<FeedExportConfig> {
    const config = await this.ensureConfig(tenantId);
    config.jsonFeed = { ...jsonFeedOf(config), ...dto };
    return this.configRepository.save(config);
  }

  async regenerateJsonKey(tenantId: number): Promise<FeedExportConfig> {
    const config = await this.ensureConfig(tenantId);
    config.jsonFeed = { ...jsonFeedOf(config), feedKey: this.generateExportKey() };
    return this.configRepository.save(config);
  }

  async getLogs(
    tenantId: number,
    days: number = 7,
    format?: ExportLogFormat,
    apiKeyId?: number,
    exportFeedId?: number,
  ): Promise<FeedExportLog[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const query = this.logRepository
      .createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId })
      .andWhere('log.accessedAt >= :since', { since });
    if (format) query.andWhere('log.format = :format', { format });
    // A website key's feed has its own log; the main feeds' logs leave those out.
    if (apiKeyId) query.andWhere('log.apiKeyId = :apiKeyId', { apiKeyId });
    else query.andWhere('log.apiKeyId IS NULL');
    // Same for an extra export feed (Feeds tab).
    if (exportFeedId) query.andWhere('log.exportFeedId = :exportFeedId', { exportFeedId });
    else query.andWhere('log.exportFeedId IS NULL');
    return query.orderBy('log.accessedAt', 'DESC').limit(LOG_ROWS).getMany();
  }

  // ============ Feed Export ============
  // Each URL feed has its own key and switch: Kyero XML the top-level ones,
  // JSON its jsonFeed settings.
  async validateExportKey(
    tenantSlug: string,
    exportKey: string,
    format: ExportFormat = 'xml',
  ): Promise<{ config: FeedExportConfig; tenantId: number }> {
    const found =
      format === 'json'
        ? await this.findConfigBySlug(tenantSlug, (c) => jsonFeedOf(c).feedKey, exportKey)
        : await this.findConfigByKey(tenantSlug, exportKey);
    const enabled = format === 'json' ? jsonFeedOf(found.config).enabled : found.config.isEnabled;
    if (!enabled) {
      throw new UnauthorizedException('Invalid export key');
    }
    return found;
  }

  async findConfigByKey(
    tenantSlug: string,
    exportKey: string,
  ): Promise<{ config: FeedExportConfig; tenantId: number; tenant: Tenant }> {
    return this.findConfigBySlug(tenantSlug, (config) => config.exportKey, exportKey);
  }

  // Slug + key → the client's config. `storedKey` picks which key this feed
  // uses (the export key, or idealista's own). Each feed checks its own switch.
  async findConfigBySlug(
    tenantSlug: string,
    storedKey: (config: FeedExportConfig) => string | null | undefined,
    providedKey: string,
  ): Promise<{ config: FeedExportConfig; tenantId: number; tenant: Tenant }> {
    const tenant = await this.tenantRepository.findOne({
      where: { slug: tenantSlug },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const config = await this.configRepository.findOne({
      where: { tenantId: tenant.id },
    });
    const expected = config ? storedKey(config) : null;

    if (!config || !expected) {
      throw new UnauthorizedException('Invalid export key');
    }

    // Use timing-safe comparison to prevent timing attacks
    const storedKeyBuffer = Buffer.from(expected);
    const providedKeyBuffer = Buffer.from(providedKey || '');

    // Keys must be same length for timingSafeEqual
    if (
      storedKeyBuffer.length !== providedKeyBuffer.length ||
      !crypto.timingSafeEqual(storedKeyBuffer, providedKeyBuffer)
    ) {
      throw new UnauthorizedException('Invalid export key');
    }

    return { config, tenantId: tenant.id, tenant };
  }

  // The dashboard's button: generates the feed exactly as a reader would get it
  // and logs it as manual. A URL feed is built fresh on every read, so this
  // sends nothing and the reader still comes on its own schedule.
  async runNow(tenantId: number, format: ExportFormat, ip: string, userAgent: string): Promise<UrlFeedRunResult> {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    const enabled = config && (format === 'json' ? jsonFeedOf(config).enabled : config.isEnabled);
    if (!config || !enabled) throw new BadRequestException('This feed is switched off. Turn it on and press Save first.');
    // exportProperties answers 401 here, which the dashboard takes as a dead session.
    if (!config.allowedFormats.includes(format)) throw new BadRequestException(`Format ${format} not allowed`);
    return runUrlFeedOnce(this.lock, format, tenantId, async () => {
      const { count, skipped } = await this.exportProperties(tenantId, config, format, ip, userAgent, 'manual');
      return { listings: count, skipped };
    });
  }

  async exportProperties(
    tenantId: number,
    config: FeedExportConfig,
    format: ExportFormat,
    ip: string,
    userAgent: string,
    trigger: ExportLogTrigger = 'read',
  ): Promise<{ content: string; contentType: string; count: number; skipped: number }> {
    const startTime = Date.now();

    // Check if format is allowed
    if (!config.allowedFormats.includes(format)) {
      throw new UnauthorizedException(`Format ${format} not allowed`);
    }

    const rules: ListingRules =
      format === 'json' ? { ...jsonFeedOf(config), propertyFilter: config.propertyFilter } : config;
    const { content, contentType, count, skipped } = await this.oneBuildAtATime(() =>
      format === 'xml' ? this.buildXml(tenantId, rules) : this.buildJson(tenantId, rules),
    );

    // Update last generated time
    config.lastGeneratedAt = new Date();
    await this.configRepository.save(config);

    // Log access
    const log = this.logRepository.create({
      tenantId,
      format,
      propertiesCount: count,
      trigger,
      requesterIp: ip.slice(0, 45),
      userAgent: userAgent.slice(0, 500),
      responseTimeMs: Date.now() - startTime,
    });
    await this.logRepository.save(log);

    return { content, contentType, count, skipped };
  }

  // A website key's own XML feed: Kyero v3, with the same listings the key
  // shows on a website (published, live, inside its scope). Needs the key on
  // and its feed switched on; the client's Kyero feed settings don't apply.
  async exportKeyFeed(
    tenantSlug: string,
    feedKey: string,
    ip: string,
    userAgent: string,
  ): Promise<{ content: string; contentType: string }> {
    const startTime = Date.now();
    const tenant = await this.tenantRepository.findOne({ where: { slug: tenantSlug }, select: ['id'] });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const key = feedKey
      ? await this.apiKeyRepository.findOne({ where: { tenantId: tenant.id, feedKey } })
      : null;
    if (!key || !key.isActive) throw new UnauthorizedException('Invalid export key');

    const rules: ListingRules = {
      includeUnpublished: false,
      includeSold: false,
      listingScope: 'all',
      keyScope: cleanKeyScope(key.scope),
    };
    const result = await this.oneBuildAtATime(() => this.buildXml(tenant.id, rules));
    await this.apiKeyRepository.update({ id: key.id }, { feedLastUsedAt: new Date() });
    await this.logRepository.save(
      this.logRepository.create({
        tenantId: tenant.id,
        apiKeyId: key.id,
        format: 'xml',
        propertiesCount: result.count,
        requesterIp: ip.slice(0, 45),
        userAgent: userAgent.slice(0, 500),
        responseTimeMs: Date.now() - startTime,
      }),
    );
    return { content: result.content, contentType: result.contentType };
  }

  // ============ Private Methods ============
  generateIdealistaKey(): string {
    return `idl_${crypto.randomBytes(24).toString('hex')}`;
  }

  private generateExportKey(): string {
    return `sk_export_${crypto.randomBytes(24).toString('hex')}`;
  }

  private async buildXml(tenantId: number, rules: ListingRules): Promise<BuiltFeed> {
    const writer = new KyeroFeedWriter(await this.loadLookups(tenantId));
    for await (const batch of this.fullListingBatches(tenantId, rules, 'xml')) writer.add(batch);
    const { xml, included, skipped } = writer.finish();
    return { content: xml, contentType: 'application/xml; charset=utf-8', count: included, skipped: skipped.length };
  }

  private async buildJson(tenantId: number, rules: ListingRules): Promise<BuiltFeed> {
    const lookups = await this.loadLookups(tenantId);
    const rows: string[] = [];
    for await (const batch of this.fullListingBatches(tenantId, rules, 'json')) {
      for (const p of batch) rows.push(jsonFeedRow(toExportProperty(p, lookups)));
    }
    return { content: joinJsonFeedRows(rows), contentType: 'application/json; charset=utf-8', count: rows.length, skipped: 0 };
  }

  private async *fullListingBatches(tenantId: number, rules: ListingRules, format: ExportFormat) {
    const query = await this.listingQuery(tenantId, rules, format);
    query
      .leftJoinAndSelect('property.location', 'location')
      .leftJoinAndSelect('property.propertyType', 'propertyType');
    yield* this.batches(query, FULL_BATCH);
  }

  // In id order, each batch picking up after the last id of the one before.
  async *batches(query: SelectQueryBuilder<Property>, size: number) {
    let afterId = 0;
    for (;;) {
      const batch = await query
        .clone()
        .andWhere('property.id > :afterId', { afterId })
        .orderBy('property.id', 'ASC')
        .take(size)
        .getMany();
      if (batch.length) yield batch;
      if (batch.length < size) return;
      afterId = batch[batch.length - 1].id;
    }
  }

  async listingQuery(
    tenantId: number,
    config: ListingRules,
    format: ExportFormat,
  ): Promise<SelectQueryBuilder<Property>> {
    const query = this.propertyRepository
      .createQueryBuilder('property')
      .where('property.tenantId = :tenantId', { tenantId });

    if (!config.includeUnpublished) {
      query.andWhere('property.isPublished = true');
    }
    // Archived listings never leave the dashboard, unpublished option or not.
    query.andWhere('property.isArchived = 0');

    // Kyero has no "sold" marker, so the XML only ever carries live listings.
    const statuses = config.includeSold && format === 'json' ? ['active', 'sold'] : ['active'];
    query.andWhere('property.status IN (:...statuses)', { statuses });

    // Own = flagged own by the feed (Resales OwnProperty) or added by hand —
    // the same rule as the idealista feed.
    if (config.listingScope === 'own') {
      query.andWhere(
        new Brackets((b) => b.where('property.isOwnProperty = 1').orWhere("property.source = 'manual'")),
      );
    }

    // Hand-picked: any of the client's listings, other agencies' too.
    if (config.listingScope === 'selected') {
      if (!config.propertyIds?.length) query.andWhere('1 = 0');
      else query.andWhere('property.id IN (:...pickedIds)', { pickedIds: config.propertyIds });
    }

    // Same rule as a website key's scope: a picked place or type brings
    // everything below it (before, only listings filed on that exact id went out).
    if (config.propertyFilter) {
      await this.propertySearch.applyKeyScope(
        query,
        cleanKeyScope({ locationIds: config.propertyFilter.locations, propertyTypeIds: config.propertyFilter.types }),
        tenantId,
        'property',
      );
    }

    if (config.keyScope) {
      await this.propertySearch.applyKeyScope(query, config.keyScope, tenantId, 'property');
    }

    return query;
  }

  async loadLookups(tenantId: number): Promise<ExportLookups> {
    const [locations, types, features] = await Promise.all([
      this.locationRepository.find({ where: { tenantId }, select: ['id', 'parentId', 'level', 'name'] }),
      this.typeRepository.find({ where: { tenantId }, select: ['id', 'name', 'parentId'] }),
      this.featureRepository.find({ where: { tenantId }, select: ['id', 'name'] }),
    ]);
    return {
      locations: new Map(
        locations.map((l) => [l.id, { id: l.id, parentId: l.parentId, level: l.level, name: l.name }]),
      ),
      types: new Map(types.map((t) => [t.id, { name: t.name, parentId: t.parentId }])),
      features: new Map(features.map((f) => [f.id, { name: f.name }])),
    };
  }
}
