import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  EXPORT_FEED_FORMATS,
  ExportFeed,
  ExportFeedFormat,
  ExportLogTrigger,
  FeedExportLog,
  Property,
  Tenant,
} from '../../database/entities';
import { FeedExportService, ListingRules } from './feed-export.service';
import { UpdateExportFeedDto } from './dto';
import { KYERO_CHECK_COLUMNS, kyeroSkipReason } from './kyero/kyero-builder';
import { FeedWriter, makeFeedWriter, FORMAT_LABELS } from './portal-writers';
import { propertyUrlSegment } from '../property/property-url';
import { displayName } from './idealista/idealista-builder';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { assertLockAcquired, UrlFeedRunResult } from './manual-run';

// Feed Export -> Feeds: any number of extra URL feeds per client, each in a
// portal format with its own listings and URL. Built fresh on every read,
// like the built-in Kyero feed, with the same listing rules (archived never,
// unpublished only when asked, live only).

const FEEDS_PER_CLIENT = 30;
const SKIPPED_SHOWN = 50;
const CHECK_BATCH = 2000;
const FULL_BATCH = 200;
const RUN_TTL_MS = 5 * 60_000;

export const EXPORT_FEED_KEY_PREFIX = 'xf_';
// Keys of feeds moved over from the old Kyero XML tab (its URL still works).
export const LEGACY_KYERO_KEY_PREFIX = 'sk_export_';

@Injectable()
export class ExportFeedsService {
  constructor(
    @InjectRepository(ExportFeed) private feedRepository: Repository<ExportFeed>,
    @InjectRepository(FeedExportLog) private logRepository: Repository<FeedExportLog>,
    @InjectRepository(Property) private propertyRepository: Repository<Property>,
    @InjectRepository(Tenant) private tenantRepository: Repository<Tenant>,
    private feedExport: FeedExportService,
    private lock: RedisLockService,
  ) {}

  // ============ Dashboard ============

  async list(tenantId: number) {
    const [feeds, tenant] = await Promise.all([
      this.feedRepository.find({ where: { tenantId }, order: { id: 'ASC' } }),
      this.tenantRepository.findOne({ where: { id: tenantId }, select: ['id', 'slug'] }),
    ]);
    const rows = [];
    // One at a time: a check reads every listing's few columns, in batches.
    for (const feed of feeds) rows.push({ ...this.publicRow(feed), ...(await this.check(tenantId, feed)) });
    return { tenantSlug: tenant?.slug ?? '', feeds: rows };
  }

  async create(tenantId: number, dto: UpdateExportFeedDto) {
    if (!dto.title?.trim()) throw new BadRequestException('Give the feed a title');
    if (!dto.format || !EXPORT_FEED_FORMATS.includes(dto.format)) throw new BadRequestException('Pick a feed type');
    const count = await this.feedRepository.count({ where: { tenantId } });
    if (count >= FEEDS_PER_CLIENT) throw new BadRequestException(`A client can have up to ${FEEDS_PER_CLIENT} feeds`);
    const feed = this.feedRepository.create({
      tenantId,
      isEnabled: true,
      includeUnpublished: false,
      listingScope: 'all',
      propertyIds: [],
      languages: [],
      propertyUrlPattern: '',
      ...this.clean(dto),
      feedKey: this.generateKey(),
    });
    const saved = await this.feedRepository.save(feed);
    return { ...this.publicRow(saved), ...(await this.check(tenantId, saved)) };
  }

  async update(tenantId: number, id: number, dto: UpdateExportFeedDto) {
    const feed = await this.own(tenantId, id);
    if (dto.title !== undefined && !dto.title.trim()) throw new BadRequestException('Give the feed a title');
    Object.assign(feed, this.clean(dto));
    const saved = await this.feedRepository.save(feed);
    return { ...this.publicRow(saved), ...(await this.check(tenantId, saved)) };
  }

  async remove(tenantId: number, id: number) {
    const feed = await this.own(tenantId, id);
    await this.feedRepository.remove(feed);
    return { deleted: true };
  }

  async regenerateKey(tenantId: number, id: number) {
    const feed = await this.own(tenantId, id);
    feed.feedKey = this.generateKey();
    return this.publicRow(await this.feedRepository.save(feed));
  }

  // References from an old feed file (Kyero ref, ThinkSpain unique_id, ...)
  // → the client's listings with that reference or agent reference.
  async matchReferences(tenantId: number, references: string[]) {
    const refs = [...new Set(references.map((r) => String(r).trim()).filter(Boolean))];
    if (!refs.length) return { propertyIds: [], missing: [] };
    const found = new Map<string, number>();
    for (let i = 0; i < refs.length; i += 1000) {
      const chunk = refs.slice(i, i + 1000);
      const rows = await this.propertyRepository
        .createQueryBuilder('p')
        .select(['p.id', 'p.reference', 'p.agentReference'])
        .where('p.tenantId = :tenantId', { tenantId })
        .andWhere(new Brackets((b) => b.where('p.reference IN (:...chunk)', { chunk }).orWhere('p.agentReference IN (:...chunk)', { chunk })))
        .getMany();
      for (const p of rows) {
        const key = (s: string | null) => (s || '').toLowerCase();
        if (!found.has(key(p.reference))) found.set(key(p.reference), p.id);
        if (p.agentReference && !found.has(key(p.agentReference))) found.set(key(p.agentReference), p.id);
      }
    }
    const propertyIds: number[] = [];
    const missing: string[] = [];
    for (const ref of refs) {
      const id = found.get(ref.toLowerCase());
      if (id == null) missing.push(ref);
      else if (!propertyIds.includes(id)) propertyIds.push(id);
    }
    return { propertyIds, missing };
  }

  async getLogs(tenantId: number, id: number, days: number) {
    await this.own(tenantId, id);
    return this.feedExport.getLogs(tenantId, days, undefined, undefined, id);
  }

  // The Push Now button: builds the feed as a reader gets it, and logs it.
  async runNow(tenantId: number, id: number, ip: string, userAgent: string): Promise<UrlFeedRunResult> {
    const feed = await this.own(tenantId, id);
    if (!feed.isEnabled) throw new BadRequestException('This feed is switched off. Turn it on and press Save first.');
    const outcome = await this.lock.withLock(`feed-export:run:feed:${feed.id}`, RUN_TTL_MS, async () => {
      const built = await this.build(feed, ip, userAgent, 'manual');
      return { listings: built.count, skipped: built.skipped };
    });
    assertLockAcquired(outcome);
    return outcome.result as UrlFeedRunResult;
  }

  // ============ Public URL ============

  async publicFeed(tenantSlug: string, feedKey: string, ip: string, userAgent: string) {
    const tenant = await this.tenantRepository.findOne({ where: { slug: tenantSlug }, select: ['id'] });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const known = feedKey.startsWith(EXPORT_FEED_KEY_PREFIX) || feedKey.startsWith(LEGACY_KYERO_KEY_PREFIX);
    const feed = known
      ? await this.feedRepository.findOne({ where: { tenantId: tenant.id, feedKey } })
      : null;
    if (!feed || !feed.isEnabled) throw new UnauthorizedException('Invalid export key');
    return this.build(feed, ip, userAgent, 'read');
  }

  // ============ Building ============

  private async build(feed: ExportFeed, ip: string, userAgent: string, trigger: ExportLogTrigger) {
    const started = Date.now();
    const result = await this.feedExport.oneBuildAtATime(async () => {
      const writer = await this.writerFor(feed);
      const query = await this.feedExport.listingQuery(feed.tenantId, this.rules(feed), 'xml');
      query.leftJoinAndSelect('property.location', 'location').leftJoinAndSelect('property.propertyType', 'propertyType');
      for await (const batch of this.feedExport.batches(query, FULL_BATCH)) writer.add(batch);
      return writer.finish();
    });
    await this.feedRepository.update({ id: feed.id }, { lastGeneratedAt: new Date() });
    await this.logRepository.save(
      this.logRepository.create({
        tenantId: feed.tenantId,
        exportFeedId: feed.id,
        format: 'xml',
        propertiesCount: result.included,
        trigger,
        requesterIp: ip.slice(0, 45),
        userAgent: userAgent.slice(0, 500),
        responseTimeMs: Date.now() - started,
      }),
    );
    return { content: result.xml, count: result.included, skipped: result.skipped.length };
  }

  private async writerFor(feed: ExportFeed): Promise<FeedWriter> {
    const [lookups, tenant] = await Promise.all([
      this.feedExport.loadLookups(feed.tenantId),
      this.tenantRepository.findOne({ where: { id: feed.tenantId }, select: ['id', 'name', 'settings'] }),
    ]);
    const slugFormat = (tenant?.settings as { slugFormat?: unknown } | null)?.slugFormat;
    const pattern = (feed.propertyUrlPattern || '').trim();
    const urlFor = /^https?:\/\//i.test(pattern)
      ? (p: Property) => {
          const segment = propertyUrlSegment(
            {
              reference: p.reference,
              title: p.title?.en || displayName(p.title),
              slug: p.slug,
              location: { name: displayName(lookups.locations.get(p.locationId ?? -1)?.name) },
              propertyType: { name: displayName(lookups.types.get(p.propertyTypeId ?? -1)?.name) },
            },
            slugFormat,
          );
          return pattern.replace(/\{segment\}/g, encodeURI(segment)).replace(/\{ref\}/g, encodeURIComponent(p.reference));
        }
      : undefined;
    return makeFeedWriter(feed.format, lookups, {
      languages: feed.languages || [],
      urlFor,
      agentName: tenant?.name || '',
    });
  }

  // How many listings the feed would send, and the first ones it leaves out.
  // Every format needs what Kyero needs (price, type, town, province).
  private async check(tenantId: number, feed: ExportFeed) {
    const lookups = await this.feedExport.loadLookups(tenantId);
    const query = await this.feedExport.listingQuery(tenantId, this.rules(feed), 'xml');
    query.select(KYERO_CHECK_COLUMNS.map((c) => `property.${c}`));
    let propertyCount = 0;
    let skippedCount = 0;
    const skipped: Array<{ reference: string; reason: string }> = [];
    for await (const batch of this.feedExport.batches(query, CHECK_BATCH)) {
      for (const p of batch) {
        let reason = kyeroSkipReason(p, lookups);
        if (!reason && feed.format === 'apits' && p.listingType !== 'sale' && p.listingType !== 'development') {
          reason = 'Rental — A Place in the Sun takes sales only';
        }
        if (!reason) propertyCount++;
        else if (++skippedCount <= SKIPPED_SHOWN) skipped.push({ reference: p.reference, reason });
      }
    }
    return { propertyCount, skippedCount, skipped };
  }

  private rules(feed: ExportFeed): ListingRules {
    return {
      includeUnpublished: feed.includeUnpublished,
      includeSold: false,
      listingScope: feed.listingScope,
      propertyIds: feed.propertyIds,
      propertyFilter: feed.propertyFilter,
    };
  }

  private async own(tenantId: number, id: number): Promise<ExportFeed> {
    const feed = await this.feedRepository.findOne({ where: { id, tenantId } });
    if (!feed) throw new NotFoundException('Feed not found');
    return feed;
  }

  private clean(dto: UpdateExportFeedDto): Partial<ExportFeed> {
    const out: Partial<ExportFeed> = {};
    if (dto.title !== undefined) out.title = dto.title.trim().slice(0, 120);
    if (dto.format !== undefined) out.format = dto.format as ExportFeedFormat;
    if (dto.isEnabled !== undefined) out.isEnabled = dto.isEnabled;
    if (dto.includeUnpublished !== undefined) out.includeUnpublished = dto.includeUnpublished;
    if (dto.listingScope !== undefined) out.listingScope = dto.listingScope;
    if (dto.propertyIds !== undefined) out.propertyIds = [...new Set(dto.propertyIds)];
    if (dto.languages !== undefined) out.languages = [...new Set(dto.languages)];
    if (dto.propertyUrlPattern !== undefined) out.propertyUrlPattern = dto.propertyUrlPattern.trim();
    return out;
  }

  private publicRow(feed: ExportFeed) {
    return {
      id: feed.id,
      title: feed.title,
      format: feed.format,
      formatLabel: FORMAT_LABELS[feed.format] ?? feed.format,
      isEnabled: feed.isEnabled,
      feedKey: feed.feedKey,
      includeUnpublished: feed.includeUnpublished,
      listingScope: feed.listingScope,
      propertyIds: feed.propertyIds || [],
      languages: feed.languages || [],
      propertyUrlPattern: feed.propertyUrlPattern || '',
      lastGeneratedAt: feed.lastGeneratedAt,
    };
  }

  private generateKey(): string {
    return `${EXPORT_FEED_KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
  }
}
