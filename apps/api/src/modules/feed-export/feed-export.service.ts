import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  FeedExportConfig,
  FeedExportLog,
  Property,
  Location,
  PropertyType,
  Feature,
  Tenant,
  ExportFormat,
  ExportLogFormat,
  JsonFeedSettings,
} from '../../database/entities';
import { UpdateFeedExportConfigDto, UpdateJsonFeedDto } from './dto';
import { displayName } from './idealista/idealista-builder';
import { KyeroLocationRow, buildKyeroFeed } from './kyero/kyero-builder';

// Which listings a URL feed sends. The Kyero XML feed reads these from the
// config's top-level columns, the JSON feed from config.jsonFeed.
interface ListingRules {
  includeUnpublished: boolean;
  includeSold: boolean;
  listingScope: 'all' | 'own';
  propertyFilter?: Record<string, any> | null;
}

// The JSON feed's settings. Rows saved before it had its own fall back to
// the shared values (the migration copies them; this covers a missed row).
export function jsonFeedOf(config: FeedExportConfig): JsonFeedSettings {
  return {
    enabled: config.jsonFeed?.enabled ?? config.isEnabled,
    includeUnpublished: config.jsonFeed?.includeUnpublished ?? config.includeUnpublished,
    includeSold: config.jsonFeed?.includeSold ?? config.includeSold,
    listingScope: config.jsonFeed?.listingScope ?? config.listingScope ?? 'all',
    feedKey: config.jsonFeed?.feedKey || config.exportKey,
  };
}

interface ExportProperty {
  id: string;
  reference: string;
  date: string;
  price: number;
  currency: string;
  type: string;
  town: string;
  province: string;
  beds: number;
  baths: number;
  buildSize: number;
  plotSize: number;
  descriptions: Record<string, string>;
  images: string[];
  features: string[];
  lat?: number;
  lng?: number;
  status: string;
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
    private configService: ConfigService,
  ) {}

  // ============ Config Management ============
  // `apiKey` / `tenantSlug` are what the dashboard page reads to show the key
  // and build the feed URLs. The row (and key) is created on first visit so
  // the page always has a real URL to show.
  async getConfig(tenantId: number) {
    const config = await this.ensureConfig(tenantId);
    const json = jsonFeedOf(config);
    const [tenant, properties, lookups, jsonCount] = await Promise.all([
      this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'slug'] }),
      this.loadProperties(tenantId, config, 'xml'),
      this.loadLookups(tenantId),
      this.loadProperties(tenantId, { ...json, propertyFilter: config.propertyFilter }, 'json').then((r) => r.length),
    ]);
    const kyero = buildKyeroFeed({ properties, ...lookups });
    const { jsonFeed: _stored, ...rest } = config;
    return {
      ...rest,
      apiKey: config.exportKey,
      json: {
        enabled: json.enabled,
        includeUnpublished: json.includeUnpublished,
        includeSold: json.includeSold,
        listingScope: json.listingScope,
        apiKey: json.feedKey,
        propertyCount: jsonCount,
      },
      tenantSlug: tenant?.slug ?? '',
      propertyCount: kyero.included,
      // Listings Kyero would reject, and why (first 50 for the page).
      skippedCount: kyero.skipped.length,
      skipped: kyero.skipped.slice(0, 50),
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
  ): Promise<FeedExportLog[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const query = this.logRepository
      .createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId })
      .andWhere('log.accessedAt >= :since', { since });
    if (format) query.andWhere('log.format = :format', { format });
    return query.orderBy('log.accessedAt', 'DESC').limit(100).getMany();
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

  async exportProperties(
    tenantId: number,
    config: FeedExportConfig,
    format: ExportFormat,
    ip: string,
    userAgent: string,
  ): Promise<{ content: string; contentType: string }> {
    const startTime = Date.now();

    // Check if format is allowed
    if (!config.allowedFormats.includes(format)) {
      throw new UnauthorizedException(`Format ${format} not allowed`);
    }

    const rules: ListingRules =
      format === 'json' ? { ...jsonFeedOf(config), propertyFilter: config.propertyFilter } : config;
    const [properties, lookups] = await Promise.all([
      this.loadProperties(tenantId, rules, format),
      this.loadLookups(tenantId),
    ]);

    let content: string;
    let contentType: string;
    let count: number;

    if (format === 'xml') {
      const result = buildKyeroFeed({ properties, ...lookups });
      content = result.xml;
      contentType = 'application/xml; charset=utf-8';
      count = result.included;
    } else {
      const rows = properties.map((p) => this.toExportProperty(p, lookups));
      content = JSON.stringify(rows, null, 2);
      contentType = 'application/json; charset=utf-8';
      count = rows.length;
    }

    // Update last generated time
    config.lastGeneratedAt = new Date();
    await this.configRepository.save(config);

    // Log access
    const log = this.logRepository.create({
      tenantId,
      format,
      propertiesCount: count,
      requesterIp: ip.slice(0, 45),
      userAgent: userAgent.slice(0, 500),
      responseTimeMs: Date.now() - startTime,
    });
    await this.logRepository.save(log);

    return { content, contentType };
  }

  // ============ Private Methods ============
  generateIdealistaKey(): string {
    return `idl_${crypto.randomBytes(24).toString('hex')}`;
  }

  private generateExportKey(): string {
    return `sk_export_${crypto.randomBytes(24).toString('hex')}`;
  }

  private async loadProperties(
    tenantId: number,
    config: ListingRules,
    format: ExportFormat,
  ): Promise<Property[]> {
    const query = this.propertyRepository
      .createQueryBuilder('property')
      .leftJoinAndSelect('property.location', 'location')
      .leftJoinAndSelect('property.propertyType', 'propertyType')
      .where('property.tenantId = :tenantId', { tenantId });

    if (!config.includeUnpublished) {
      query.andWhere('property.isPublished = true');
    }

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

    if (config.propertyFilter) {
      if (config.propertyFilter.locations?.length) {
        query.andWhere('property.locationId IN (:...locations)', {
          locations: config.propertyFilter.locations,
        });
      }
      if (config.propertyFilter.types?.length) {
        query.andWhere('property.propertyTypeId IN (:...types)', {
          types: config.propertyFilter.types,
        });
      }
    }

    return query.orderBy('property.id', 'ASC').getMany();
  }

  private async loadLookups(tenantId: number): Promise<ExportLookups> {
    const [locations, types, features] = await Promise.all([
      this.locationRepository.find({ where: { tenantId }, select: ['id', 'parentId', 'level', 'name'] }),
      this.typeRepository.find({ where: { tenantId }, select: ['id', 'name'] }),
      this.featureRepository.find({ where: { tenantId }, select: ['id', 'name'] }),
    ]);
    return {
      locations: new Map(
        locations.map((l) => [l.id, { id: l.id, parentId: l.parentId, level: l.level, name: l.name }]),
      ),
      types: new Map(types.map((t) => [t.id, { name: t.name }])),
      features: new Map(features.map((f) => [f.id, { name: f.name }])),
    };
  }

  private toExportProperty(p: Property, lookups: ExportLookups): ExportProperty {
    return {
      id: p.reference,
      reference: p.reference,
      date: p.updatedAt.toISOString().split('T')[0],
      price: p.price || 0,
      currency: p.currency,
      type: displayName(p.propertyType?.name),
      town: displayName(p.location?.name),
      province: provinceOf(p, lookups.locations),
      beds: p.bedrooms || 0,
      baths: p.bathrooms || 0,
      buildSize: p.buildSize || 0,
      plotSize: p.plotSize || 0,
      descriptions: p.description || {},
      images: [...(p.images || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((img) => img.url),
      features: (p.features || [])
        .map((fId) => displayName(lookups.features.get(fId)?.name))
        .filter((f): f is string => !!f),
      lat: p.lat ?? undefined,
      lng: p.lng ?? undefined,
      status: p.status,
    };
  }
}

interface ExportLookups {
  locations: Map<number, KyeroLocationRow>;
  types: Map<number, { name: Record<string, string> | null }>;
  features: Map<number, { name: Record<string, string> | null }>;
}

function provinceOf(p: Property, locations: Map<number, KyeroLocationRow>): string {
  const seen = new Set<number>();
  let cur = p.locationId != null ? locations.get(p.locationId) : undefined;
  while (cur && !seen.has(cur.id)) {
    if (cur.level === 'province') return displayName(cur.name);
    seen.add(cur.id);
    cur = cur.parentId != null ? locations.get(cur.parentId) : undefined;
  }
  return p.feedLocation?.province || '';
}
