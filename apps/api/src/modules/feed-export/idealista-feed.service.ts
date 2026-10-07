import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import {
  Feature,
  FeedExportConfig,
  FeedExportLog,
  IdealistaExportSettings,
  Location,
  LocationTemplateNode,
  Property,
  PropertyType,
  Tenant,
} from '../../database/entities';
import { UpdateIdealistaSettingsDto, UpdateIdealistaTypesDto } from './dto';
import { FeedExportService } from './feed-export.service';
import { IDEALISTA_TYPES } from './idealista/idealista-catalog';
import {
  BuilderResult,
  LocationRow,
  TypeRow,
  buildIdealistaFeed,
  displayName,
  resolveIdealistaType,
} from './idealista/idealista-builder';

const DEFAULT_SETTINGS: IdealistaExportSettings = {
  enabled: false,
  customerCode: '',
  country: 'Spain',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  addressVisibility: 'hidden',
  mode: 'own',
  propertyIds: [],
  propertyUrlPattern: '',
};

// Listing types idealista takes (holiday rentals are not published there).
const LISTING_TYPES = ['sale', 'rent', 'development'];

@Injectable()
export class IdealistaFeedService {
  constructor(
    private readonly feedExport: FeedExportService,
    @InjectRepository(FeedExportConfig)
    private readonly configRepository: Repository<FeedExportConfig>,
    @InjectRepository(FeedExportLog)
    private readonly logRepository: Repository<FeedExportLog>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(PropertyType)
    private readonly typeRepository: Repository<PropertyType>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(LocationTemplateNode)
    private readonly templateNodeRepository: Repository<LocationTemplateNode>,
    @InjectRepository(Feature)
    private readonly featureRepository: Repository<Feature>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  // ============ Dashboard ============

  async getOverview(tenantId: number) {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    // Set up before idealista had its own key: give it one now.
    if (config?.idealista && !config.idealista.feedKey) {
      config.idealista = { ...config.idealista, feedKey: this.feedExport.generateIdealistaKey() };
      await this.configRepository.save(config);
    }
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'slug'] });
    const types = await this.loadTypes(tenantId);
    return {
      settings: publicSettings(config),
      tenantSlug: tenant?.slug ?? '',
      feedKey: config?.idealista?.feedKey ?? null,
      typeOptions: IDEALISTA_TYPES,
      types: [...types.values()]
        .map((t) => {
          const effective = resolveIdealistaType(t.id, types);
          return {
            id: t.id,
            parentId: t.parentId,
            name: displayName(t.name),
            idealistaType: t.idealistaType,
            effectiveType: effective.value,
            source: effective.source,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async updateSettings(tenantId: number, dto: UpdateIdealistaSettingsDto) {
    const config = await this.feedExport.ensureConfig(tenantId);
    const next: IdealistaExportSettings = { ...settingsOf(config), ...stripUndefined(dto) };
    next.propertyIds = [...new Set(next.propertyIds || [])];
    next.feedKey = config.idealista?.feedKey || this.feedExport.generateIdealistaKey();
    config.idealista = next;
    await this.configRepository.save(config);
    return { settings: publicSettings(config), feedKey: next.feedKey };
  }

  // A new idealista URL; the old one stops working at once.
  async regenerateKey(tenantId: number) {
    const config = await this.feedExport.ensureConfig(tenantId);
    config.idealista = { ...settingsOf(config), feedKey: this.feedExport.generateIdealistaKey() };
    await this.configRepository.save(config);
    return { feedKey: config.idealista.feedKey };
  }

  async updateTypes(tenantId: number, dto: UpdateIdealistaTypesDto) {
    const ids = dto.types.map((t) => t.id);
    if (!ids.length) return { updated: 0 };
    const owned = await this.typeRepository.find({ where: { tenantId, id: In(ids) }, select: ['id'] });
    const ownedIds = new Set(owned.map((t) => t.id));
    const foreign = ids.filter((id) => !ownedIds.has(id));
    if (foreign.length) throw new BadRequestException(`Unknown property type(s): ${foreign.join(', ')}`);
    for (const t of dto.types) {
      await this.typeRepository.update({ id: t.id, tenantId }, { idealistaType: t.idealistaType });
    }
    return { updated: dto.types.length };
  }

  // What the feed holds right now, and what is left out and why.
  async check(tenantId: number) {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    const settings = settingsOf(config);
    const result = await this.build(tenantId, settings);
    const warnings: string[] = [];
    if (!/^ilc[a-z0-9]{40}$/.test(settings.customerCode)) {
      warnings.push('No idealista customer code yet — idealista gives it to the agency ("ilc" + 40 characters).');
    }
    if (!settings.contactEmail) warnings.push('No contact email — idealista sends leads to it.');
    if (!settings.enabled) warnings.push('The idealista feed is switched off — the URL answers 404 until it is on.');
    if (settings.mode === 'selected' && !settings.propertyIds.length) warnings.push('No listings picked yet.');
    return {
      included: result.included,
      skipped: result.skipped,
      issues: result.issues,
      warnings,
      sample: (result.feed.customerProperties as unknown[])[0] ?? null,
    };
  }

  // Own listings for the picker: search by reference / title.
  async searchListings(tenantId: number, search: string, onlyIds?: number[]) {
    const q = this.ownListingsQuery(tenantId)
      .select(['p.id', 'p.reference', 'p.agentReference', 'p.title', 'p.price', 'p.listingType', 'p.status', 'p.isPublished'])
      .orderBy('p.updatedAt', 'DESC')
      .take(onlyIds ? 500 : 30);
    if (onlyIds) {
      if (!onlyIds.length) return [];
      q.andWhere('p.id IN (:...onlyIds)', { onlyIds });
    } else if (search.trim()) {
      const like = `%${search.trim().replace(/[%_\\]/g, '\\$&')}%`;
      q.andWhere(
        new Brackets((b) =>
          b
            .where('p.reference LIKE :like', { like })
            .orWhere('p.agentReference LIKE :like', { like })
            .orWhere("JSON_UNQUOTE(JSON_EXTRACT(p.title, '$.en')) LIKE :like", { like }),
        ),
      );
    }
    const rows = await q.getMany();
    return rows.map((p) => ({
      id: p.id,
      reference: p.reference,
      agentReference: p.agentReference,
      title: displayName(p.title),
      price: p.price,
      listingType: p.listingType,
      live: p.status === 'active' && p.isPublished,
    }));
  }

  // ============ Public feed ============

  async publicFeed(tenantSlug: string, feedKey: string, ip: string, userAgent: string) {
    const started = Date.now();
    const { config, tenantId, tenant } = await this.feedExport.findConfigBySlug(
      tenantSlug,
      (c) => c.idealista?.feedKey,
      feedKey,
    );
    const settings = settingsOf(config);
    if (!settings.enabled) throw new NotFoundException('idealista feed is not enabled');

    const result = await this.build(tenantId, settings, tenant);
    await this.logRepository.save(
      this.logRepository.create({
        tenantId,
        format: 'json',
        propertiesCount: result.included,
        requesterIp: ip.slice(0, 45),
        userAgent: userAgent.slice(0, 500),
        responseTimeMs: Date.now() - started,
      }),
    );
    return result.feed;
  }

  // ============ Internals ============

  private ownListingsQuery(tenantId: number) {
    // Own = flagged own by the feed (Resales OwnProperty) or added by hand.
    return this.propertyRepository
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.listingType IN (:...listingTypes)', { listingTypes: LISTING_TYPES })
      .andWhere(new Brackets((b) => b.where('p.isOwnProperty = 1').orWhere("p.source = 'manual'")));
  }

  private async build(tenantId: number, settings: IdealistaExportSettings, tenant?: Tenant): Promise<BuilderResult> {
    const q = this.ownListingsQuery(tenantId)
      .andWhere("p.status = 'active'")
      .andWhere('p.isPublished = 1')
      .orderBy('p.id', 'ASC');
    if (settings.mode === 'selected') {
      if (!settings.propertyIds.length) q.andWhere('1 = 0');
      else q.andWhere('p.id IN (:...ids)', { ids: settings.propertyIds });
    }

    const [properties, types, locations, features, tenantRow] = await Promise.all([
      q.getMany(),
      this.loadTypes(tenantId),
      this.loadLocations(tenantId),
      this.featureRepository.find({ where: { tenantId }, select: ['id', 'name'] }),
      tenant ?? this.tenantRepository.findOne({ where: { id: tenantId } }),
    ]);

    return buildIdealistaFeed({
      settings,
      properties,
      types,
      locations,
      features: new Map(features.map((f) => [f.id, { id: f.id, name: f.name }])),
      slugFormat: (tenantRow?.settings as { slugFormat?: unknown } | null)?.slugFormat,
    });
  }

  private async loadTypes(tenantId: number): Promise<Map<number, TypeRow>> {
    const rows = await this.typeRepository.find({
      where: { tenantId },
      select: ['id', 'parentId', 'name', 'idealistaType'],
    });
    return new Map(rows.map((t) => [t.id, { id: t.id, parentId: t.parentId, name: t.name, idealistaType: t.idealistaType }]));
  }

  private async loadLocations(tenantId: number): Promise<Map<number, LocationRow>> {
    const rows = await this.locationRepository.find({
      where: { tenantId },
      select: ['id', 'parentId', 'level', 'name', 'lat', 'lng', 'templateNodeId'],
    });
    const nodeIds = [...new Set(rows.map((l) => l.templateNodeId).filter((id): id is number => id != null))];
    const nodes = nodeIds.length
      ? await this.templateNodeRepository.find({ where: { id: In(nodeIds) }, select: ['id', 'postcode'] })
      : [];
    const postcodes = new Map(nodes.map((n) => [n.id, n.postcode]));
    return new Map(
      rows.map((l) => [
        l.id,
        {
          id: l.id,
          parentId: l.parentId,
          level: l.level,
          name: l.name,
          lat: l.lat,
          lng: l.lng,
          postcode: l.templateNodeId != null ? postcodes.get(l.templateNodeId) ?? null : null,
        },
      ]),
    );
  }
}

function settingsOf(config: FeedExportConfig | null): IdealistaExportSettings {
  return { ...DEFAULT_SETTINGS, ...(config?.idealista || {}) };
}

// Settings for the dashboard form — the key is returned on its own.
function publicSettings(config: FeedExportConfig | null): Omit<IdealistaExportSettings, 'feedKey'> {
  const { feedKey: _feedKey, ...rest } = settingsOf(config);
  return rest;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
