import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, LessThan, Repository } from 'typeorm';
import {
  Feature,
  FeedExportConfig,
  Location,
  Property,
  PropertyType,
  RightmoveExportSettings,
  RightmoveListing,
  RightmoveLocation,
  RightmovePushLog,
  RightmoveRunTrigger,
} from '../../../database/entities';
import { RedisLockService } from '../../../common/redis/redis-lock.service';
import { RightmoveClient, RmResponse } from './rightmove-client';
import {
  RmBuilt,
  RmContext,
  RmLocationRow,
  RmSkipped,
  RmTypeRow,
  buildRightmoveProperty,
  indexGazetteer,
  isSkipped,
} from './rightmove-builder';
import { CHANNEL_SALES, REMOVAL_REASON } from './rightmove-catalog';
import { assertLockAcquired } from '../manual-run';

export const DEFAULT_RIGHTMOVE: RightmoveExportSettings = {
  enabled: false,
  networkId: null,
  branchId: null,
  mode: 'own',
  propertyIds: [],
  includeSpanish: true,
};

export function rightmoveSettings(config: FeedExportConfig | null): RightmoveExportSettings {
  return { ...DEFAULT_RIGHTMOVE, ...(config?.rightmove || {}) };
}

// Listings Rightmove Overseas takes (sales; developments are new homes).
const LISTING_TYPES = ['sale', 'development'];
const MAX_LISTINGS = 2000;
const LOG_DAYS = 30;
const PUSH_LOCK_TTL_MS = 30 * 60_000;
const pushLockKey = (tenantId: number) => `rightmove:push:${tenantId}`;

export interface BuildResult {
  settings: RightmoveExportSettings;
  built: Array<RmBuilt & { propertyId: number }>;
  skipped: Array<RmSkipped & { propertyId: number }>;
}

export interface PushSummary {
  dryRun: boolean;
  sent: number;
  unchanged: number;
  removed: number;
  failed: number;
  skipped: number;
  message?: string;
}

@Injectable()
export class RightmoveSyncService {
  private readonly logger = new Logger(RightmoveSyncService.name);

  constructor(
    private readonly client: RightmoveClient,
    private readonly lock: RedisLockService,
    @InjectRepository(FeedExportConfig)
    private readonly configRepository: Repository<FeedExportConfig>,
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(PropertyType)
    private readonly typeRepository: Repository<PropertyType>,
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    @InjectRepository(Feature)
    private readonly featureRepository: Repository<Feature>,
    @InjectRepository(RightmoveLocation)
    private readonly placeRepository: Repository<RightmoveLocation>,
    @InjectRepository(RightmoveListing)
    private readonly listingRepository: Repository<RightmoveListing>,
    @InjectRepository(RightmovePushLog)
    private readonly logRepository: Repository<RightmovePushLog>,
  ) {}

  // ============ Schedule ============

  @Cron('*/30 * * * *')
  async scheduledPush(): Promise<void> {
    if (!this.client.isLive) return; // dry: nothing to send on a timer
    const outcome = await this.lock.withLock('rightmove:scheduled', 25 * 60_000, async () => {
      const configs = await this.configRepository
        .createQueryBuilder('c')
        .where("JSON_EXTRACT(c.rightmove, '$.enabled') = true")
        .getMany();
      for (const config of configs) {
        try {
          await this.pushTenant(config.tenantId);
        } catch (err) {
          this.logger.error(`Rightmove push failed for tenant ${config.tenantId}`, err as Error);
        }
      }
      await this.logRepository.delete({ createdAt: LessThan(new Date(Date.now() - LOG_DAYS * 86_400_000)) });
    });
    if (!outcome.acquired) this.logger.log('Rightmove push already running on another process; skipping');
  }

  // ============ Build ============

  async build(tenantId: number): Promise<BuildResult> {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    const settings = rightmoveSettings(config);
    const [properties, ctx] = await Promise.all([this.loadListings(tenantId, settings), this.loadContext(tenantId, settings)]);
    const built: BuildResult['built'] = [];
    const skipped: BuildResult['skipped'] = [];
    for (const p of properties) {
      const r = buildRightmoveProperty(p, ctx);
      if (isSkipped(r)) skipped.push({ ...r, propertyId: p.id });
      else built.push({ ...r, propertyId: p.id });
    }
    return { settings, built, skipped };
  }

  // ============ Push ============

  // Sends what changed since the last push and takes off what left. One run
  // per client at a time; a second call while one runs returns at once.
  async pushTenant(tenantId: number): Promise<PushSummary> {
    const outcome = await this.lock.withLock(pushLockKey(tenantId), PUSH_LOCK_TTL_MS, () => this.runPush(tenantId, 'auto'));
    if (!outcome.acquired) {
      return { dryRun: !this.client.isLive, sent: 0, unchanged: 0, removed: 0, failed: 0, skipped: 0, message: 'A push is already running' };
    }
    return outcome.result as PushSummary;
  }

  // The dashboard's button: the same run as the schedule, started in the
  // background. Resolves once this run holds the lock; rejects if the feed
  // can't run or one is already going. The result lands in the push log.
  async startManualPush(tenantId: number): Promise<{ started: true; dryRun: boolean }> {
    const settings = rightmoveSettings(await this.configRepository.findOne({ where: { tenantId } }));
    if (!settings.enabled) throw new BadRequestException('Rightmove is switched off. Turn it on and press Save first.');
    if (!settings.networkId || !settings.branchId) throw new BadRequestException('Add the Rightmove network and branch ID first');
    const dryRun = !this.client.isLive;
    return new Promise((resolve, reject) => {
      this.lock
        .withLock(pushLockKey(tenantId), PUSH_LOCK_TTL_MS, async () => {
          resolve({ started: true, dryRun });
          await this.runManualPush(tenantId, dryRun);
        })
        .then(assertLockAcquired)
        .catch(reject);
    });
  }

  private async runManualPush(tenantId: number, dryRun: boolean): Promise<void> {
    const started = Date.now();
    try {
      await this.runPush(tenantId, 'manual');
    } catch (err) {
      this.logger.error(`Manual Rightmove push failed for tenant ${tenantId}`, err as Error);
      await this.logRun(tenantId, 'manual', { ...EMPTY_COUNTS, dryRun }, started, `The push stopped: ${(err as Error).message}`).catch((e) =>
        this.logger.error(`Could not log the failed push for tenant ${tenantId}`, e as Error),
      );
    }
  }

  // Whether a push is going (by hand or by the schedule), and how the last one ended.
  async pushStatus(tenantId: number) {
    const [running, lastRun] = await Promise.all([
      this.lock.isHeld(pushLockKey(tenantId)),
      this.logRepository.findOne({ where: { tenantId, action: 'run' }, order: { id: 'DESC' } }),
    ]);
    return {
      running,
      lastRun: lastRun && {
        id: lastRun.id,
        trigger: lastRun.trigger,
        success: lastRun.success,
        dryRun: lastRun.dryRun,
        summary: lastRun.summary,
        message: lastRun.message,
        createdAt: lastRun.createdAt,
      },
    };
  }

  private async runPush(tenantId: number, trigger: RightmoveRunTrigger): Promise<PushSummary> {
    const started = Date.now();
    const { settings, built, skipped } = await this.build(tenantId);
    const dryRun = !this.client.isLive;
    const summary: PushSummary = { dryRun, sent: 0, unchanged: 0, removed: 0, failed: 0, skipped: skipped.length };
    if (!settings.enabled) return { ...summary, message: 'Rightmove is switched off' };
    if (!settings.networkId || !settings.branchId) return { ...summary, message: 'Add the Rightmove network and branch ID first' };

    const rows = await this.listingRepository.find({ where: { tenantId } });
    const byRef = new Map(rows.map((r) => [r.agentRef, r]));

    for (const item of built) {
      const row = byRef.get(item.agentRef);
      if (row && row.state === 'live' && row.payloadHash === item.hash) {
        summary.unchanged++;
        continue;
      }
      if (dryRun) {
        summary.sent++;
        continue;
      }
      const res = await this.client.sendProperty(item.payload);
      await this.log(tenantId, 'send', item.agentRef, res);
      await this.saveListing(tenantId, item.agentRef, item.propertyId, res, item.hash, row);
      if (res.ok) summary.sent++;
      else summary.failed++;
    }

    // Live on Rightmove but no longer in the feed: sold, unpublished,
    // deleted, a rental now, or unpicked. Skipped listings stay as they are.
    const inScope = new Set([...built, ...skipped].map((b) => b.agentRef));
    const leaving = rows.filter((r) => r.state === 'live' && !inScope.has(r.agentRef));
    const statuses = await this.propertyStatuses(tenantId, leaving.map((r) => r.propertyId));
    for (const row of leaving) {
      if (dryRun) {
        summary.removed++;
        continue;
      }
      const status = row.propertyId != null ? statuses.get(row.propertyId) : undefined;
      const reason = status === 'sold' ? REMOVAL_REASON.soldByUs : status ? REMOVAL_REASON.withdrawn : REMOVAL_REASON.removed;
      const res = await this.client.removeProperty({
        network: { network_id: settings.networkId },
        branch: { branch_id: settings.branchId, channel: CHANNEL_SALES },
        property: { agent_ref: row.agentRef, removal_reason: reason },
      });
      await this.log(tenantId, 'remove', row.agentRef, res);
      // Already gone on Rightmove's side counts as removed.
      if (res.ok || /not (be )?found|does not exist/i.test(res.message)) {
        row.state = 'removed';
        row.payloadHash = null;
        row.lastError = null;
        summary.removed++;
      } else {
        row.lastError = errorText(res);
        summary.failed++;
      }
      await this.listingRepository.save(row);
    }

    await this.logRun(tenantId, trigger, summary, started);
    return summary;
  }

  // One row per run. A scheduled run that changed nothing leaves no row, or
  // they would push every real entry out of the log within days.
  private async logRun(tenantId: number, trigger: RightmoveRunTrigger, summary: PushSummary, started: number, error?: string) {
    const { dryRun, sent, removed, unchanged, failed, skipped } = summary;
    if (trigger === 'auto' && !error && !sent && !removed && !failed) return;
    const counts = `${sent} sent, ${removed} removed, ${unchanged} unchanged, ${failed} failed, ${skipped} left out`;
    await this.logRepository.save(
      this.logRepository.create({
        tenantId,
        action: 'run',
        trigger,
        summary: { sent, removed, unchanged, failed, skipped },
        success: !error && !failed,
        dryRun,
        message: (error ?? (dryRun ? `Dry run (no Rightmove certificate yet), nothing reached Rightmove: ${counts}` : counts)).slice(0, 1000),
        responseTimeMs: Date.now() - started,
      }),
    );
  }

  // What Rightmove holds for the branch versus what SPM thinks is live.
  async reconcile(tenantId: number) {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    const settings = rightmoveSettings(config);
    if (!this.client.isLive) return { dryRun: true, onRightmove: null, missing: [], unknown: [] };
    if (!settings.networkId || !settings.branchId) return { dryRun: false, onRightmove: null, missing: [], unknown: [], message: 'Add the Rightmove network and branch ID first' };
    const res = await this.client.branchPropertyList({
      network: { network_id: settings.networkId },
      branch: { branch_id: settings.branchId, channel: CHANNEL_SALES },
    });
    await this.log(tenantId, 'list', null, res);
    if (!res.ok) return { dryRun: false, onRightmove: null, missing: [], unknown: [], message: errorText(res) };
    const remote = new Set((res.properties || []).map((p) => p.agentRef));
    const live = await this.listingRepository.find({ where: { tenantId, state: 'live' } });
    // Missing on Rightmove: clear the hash so the next push sends them again.
    const missing = live.filter((r) => !remote.has(r.agentRef));
    for (const row of missing) {
      row.payloadHash = null;
      await this.listingRepository.save(row);
    }
    const ours = new Set(live.map((r) => r.agentRef));
    // On Rightmove but not sent by SPM (old feed, or added in RightmovePlus):
    // reported only — SPM never removes what it didn't send.
    const unknown = [...remote].filter((ref) => !ours.has(ref));
    return { dryRun: false, onRightmove: remote.size, missing: missing.map((r) => r.agentRef), unknown };
  }

  // ============ Internals ============

  private async saveListing(
    tenantId: number,
    agentRef: string,
    propertyId: number,
    res: RmResponse,
    hash: string,
    existing: RightmoveListing | undefined,
  ) {
    const row = existing ?? this.listingRepository.create({ tenantId, agentRef });
    row.propertyId = propertyId;
    row.warnings = res.warnings.length ? res.warnings.map((w) => ({ code: w.code, description: w.description })) : null;
    if (res.ok) {
      row.state = 'live';
      row.rightmoveId = res.rightmoveId ?? row.rightmoveId ?? null;
      row.rightmoveUrl = res.rightmoveUrl ?? row.rightmoveUrl ?? null;
      row.lastPushedAt = new Date();
      row.lastError = null;
      // A media warning (INT_*) means some photos didn't load: no hash, so
      // the next run sends the listing again.
      row.payloadHash = res.warnings.some((w) => /^INT_/i.test(w.code)) ? null : hash;
    } else {
      if (!existing) row.state = 'error';
      row.payloadHash = null;
      row.lastError = errorText(res);
    }
    await this.listingRepository.save(row);
  }

  private async log(tenantId: number, action: RightmovePushLog['action'], agentRef: string | null, res: RmResponse) {
    await this.logRepository.save(
      this.logRepository.create({
        tenantId,
        action,
        agentRef,
        success: res.ok,
        message: res.message.slice(0, 1000),
        errors: res.errors.length ? res.errors.map((e) => ({ code: e.code, description: e.description })) : null,
        warnings: res.warnings.length ? res.warnings.map((w) => ({ code: w.code, description: w.description })) : null,
        responseTimeMs: res.ms,
      }),
    );
  }

  private async propertyStatuses(tenantId: number, ids: Array<number | null>): Promise<Map<number, string>> {
    const clean = ids.filter((id): id is number => id != null);
    if (!clean.length) return new Map();
    const rows = await this.propertyRepository.find({ where: { tenantId, id: In(clean) }, select: ['id', 'status'] });
    return new Map(rows.map((r) => [r.id, r.status]));
  }

  // Live, for sale, and either own (Resales OwnProperty or added by hand) or
  // hand-picked (any listing, other agencies' too).
  private loadListings(tenantId: number, settings: RightmoveExportSettings): Promise<Property[]> {
    const q = this.propertyRepository
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.listingType IN (:...listingTypes)', { listingTypes: LISTING_TYPES })
      .andWhere("p.status = 'active'")
      .andWhere('p.isPublished = 1')
      .orderBy('p.id', 'ASC')
      .take(MAX_LISTINGS);
    if (settings.mode === 'selected') {
      if (!settings.propertyIds.length) q.andWhere('1 = 0');
      else q.andWhere('p.id IN (:...ids)', { ids: settings.propertyIds });
    } else {
      q.andWhere(new Brackets((b) => b.where('p.isOwnProperty = 1').orWhere("p.source = 'manual'")));
    }
    return q.getMany();
  }

  async loadContext(tenantId: number, settings: RightmoveExportSettings): Promise<RmContext> {
    const [types, locations, features, places] = await Promise.all([
      this.loadTypes(tenantId),
      this.loadLocations(tenantId),
      this.featureRepository.find({ where: { tenantId }, select: ['id', 'name'] }),
      this.placeRepository.find({ where: { countryCode: 'ES' } }),
    ]);
    return {
      settings,
      types,
      locations,
      features: new Map(features.map((f) => [f.id, { id: f.id, name: f.name }])),
      gazetteer: indexGazetteer(places),
    };
  }

  async loadTypes(tenantId: number): Promise<Map<number, RmTypeRow>> {
    const rows = await this.typeRepository.find({ where: { tenantId }, select: ['id', 'parentId', 'name', 'rightmoveType'] });
    return new Map(rows.map((t) => [t.id, { id: t.id, parentId: t.parentId, name: t.name, rightmoveType: t.rightmoveType }]));
  }

  async loadLocations(tenantId: number): Promise<Map<number, RmLocationRow>> {
    const rows = await this.locationRepository.find({
      where: { tenantId },
      select: ['id', 'parentId', 'level', 'name', 'rightmoveLocationId'],
    });
    return new Map(
      rows.map((l) => [l.id, { id: l.id, parentId: l.parentId, level: l.level, name: l.name, rightmoveLocationId: l.rightmoveLocationId }]),
    );
  }
}

const EMPTY_COUNTS = { sent: 0, unchanged: 0, removed: 0, failed: 0, skipped: 0 };

function errorText(res: RmResponse): string {
  const details = res.errors.map((e) => `${e.code}: ${e.description}`).join('; ');
  return (details || res.message).slice(0, 1000);
}
