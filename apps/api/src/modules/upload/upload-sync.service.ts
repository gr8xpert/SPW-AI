import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { MediaBlob, MediaFile, TenantStorageConfig } from '../../database/entities';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { UploadService } from './upload.service';

const SYNC_LOCK_KEY = 'cron:upload-sync';
const SYNC_LOCK_TTL_MS = 30 * 60 * 1000;
const PAGE = 200;
// Stop a run after this many R2 failures in a row: R2 is still down, and the
// next tick will try again.
const MAX_CONSECUTIVE_FAILURES = 5;

export interface UploadSyncCounts {
  moved: number;
  failed: number;
  missing: number;
}

type Json = unknown;

// Files land on local disk only when R2 is unreachable at upload time (see
// UploadService.putObject), or were uploaded before R2 was configured. This
// moves them to R2, points every stored URL at the R2 copy, then deletes the
// local file. Anything still holding an old /uploads/ URL (a cached page, a
// column this misses) is redirected by the /uploads middleware in main.ts.
@Injectable()
export class UploadSyncService {
  private readonly logger = new Logger(UploadSyncService.name);
  // Keys already reported missing, so a lost file logs once per process.
  private readonly reportedMissing = new Set<string>();

  constructor(
    @InjectRepository(MediaBlob)
    private readonly blobRepo: Repository<MediaBlob>,
    @InjectRepository(MediaFile)
    private readonly fileRepo: Repository<MediaFile>,
    private readonly dataSource: DataSource,
    private readonly uploadService: UploadService,
    private readonly lock: RedisLockService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async scheduledSync(): Promise<void> {
    const outcome = await this.lock.withLock(SYNC_LOCK_KEY, SYNC_LOCK_TTL_MS, () =>
      this.syncLocalToRemote(),
    );
    const c = outcome.result;
    if (c && (c.moved || c.failed)) {
      this.logger.log(`upload sync: ${c.moved} moved to R2, ${c.failed} failed, ${c.missing} missing on disk`);
    }
  }

  async syncLocalToRemote(): Promise<UploadSyncCounts> {
    const counts: UploadSyncCounts = { moved: 0, failed: 0, missing: 0 };
    const configs = new Map<number, TenantStorageConfig | null>();
    const configFor = async (tenantId: number) => {
      if (!configs.has(tenantId)) configs.set(tenantId, await this.uploadService.getStorageConfig(tenantId));
      return configs.get(tenantId)!;
    };
    let streak = 0;
    const r2Down = () => streak >= MAX_CONSECUTIVE_FAILURES;

    // Deduped images (main + thumbnail) — one row per stored object.
    let lastId = 0;
    while (!r2Down()) {
      const blobs = await this.blobRepo.find({
        where: { storageType: 'local', id: MoreThan(lastId) },
        order: { id: 'ASC' },
        take: PAGE,
      });
      if (!blobs.length) break;
      lastId = blobs[blobs.length - 1].id;
      for (const blob of blobs) {
        if (r2Down()) break;
        const config = await configFor(blob.tenantId);
        if (config?.storageType !== 's3') continue;
        const r = await this.moveOne(config, blob.tenantId, blob.storageKey, blob.mimeType, async (url) => {
          const res = await this.dataSource.query(
            `UPDATE media_blobs SET storageType = 's3' WHERE id = ? AND storageType = 'local'`,
            [blob.id],
          );
          return this.affected(res) === 1 ? url : null;
        });
        streak = this.tally(counts, r, streak);
      }
    }

    // Non-deduped files (PDFs and other documents).
    lastId = 0;
    while (!r2Down()) {
      const files = await this.fileRepo.find({
        where: { storageType: 'local', contentHash: IsNull(), id: MoreThan(lastId) },
        order: { id: 'ASC' },
        take: PAGE,
      });
      if (!files.length) break;
      lastId = files[files.length - 1].id;
      for (const file of files) {
        if (r2Down()) break;
        const config = await configFor(file.tenantId);
        if (config?.storageType !== 's3') continue;
        const r = await this.moveOne(config, file.tenantId, file.storedPath, file.mimeType, async (url) => {
          const res = await this.dataSource.query(
            `UPDATE media_files SET storageType = 's3', url = ? WHERE id = ? AND storageType = 'local'`,
            [url, file.id],
          );
          return this.affected(res) === 1 ? url : null;
        });
        streak = this.tally(counts, r, streak);
      }
    }

    if (r2Down()) this.logger.warn('upload sync: R2 still failing, will retry on the next run');
    return counts;
  }

  // Where an old /uploads/<key> URL now lives, once the file has moved to R2.
  // Null while the file is still on disk (static serving handles it) or unknown.
  async movedUploadUrl(key: string): Promise<string | null> {
    const local = this.uploadService.localPath(key);
    if (!local) return null;
    const onDisk = await fs.access(local).then(() => true, () => false);
    if (onDisk) return null;
    const blob = await this.blobRepo.findOne({ where: { storageKey: key, storageType: 's3' } });
    if (blob) {
      const config = await this.uploadService.getStorageConfig(blob.tenantId);
      return config ? this.uploadService.urlForKey(config, key, 's3') : null;
    }
    const file = await this.fileRepo.findOne({ where: { storedPath: key, storageType: 's3' } });
    return file?.url ?? null;
  }

  private async moveOne(
    config: TenantStorageConfig,
    tenantId: number,
    key: string,
    mimeType: string,
    markMoved: (url: string) => Promise<string | null>,
  ): Promise<'moved' | 'failed' | 'missing' | 'gone'> {
    const local = this.uploadService.localPath(key);
    if (!local) return 'missing';
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(local);
    } catch {
      if (!this.reportedMissing.has(key)) {
        this.reportedMissing.add(key);
        this.logger.warn(`upload sync: ${key} is marked local but not on disk`);
      }
      return 'missing';
    }

    let url: string;
    try {
      url = await this.uploadService.uploadToS3(config, key, buffer, mimeType);
    } catch (err) {
      this.logger.warn(`upload sync: R2 upload failed for ${key}: ${(err as Error).message}`);
      return 'failed';
    }

    const moved = await markMoved(url);
    if (!moved) {
      // Deleted (refcount hit zero) while we were uploading — drop the copy.
      await this.uploadService.deleteFromS3(config, key).catch(() => undefined);
      return 'gone';
    }
    await this.rewriteUrls(tenantId, key, url);
    await this.uploadService.deleteFromLocal(key).catch((err) =>
      this.logger.warn(`upload sync: could not delete local ${key}: ${(err as Error).message}`),
    );
    return 'moved';
  }

  // Points every stored copy of `/uploads/<key>` at its new URL. Matching on the
  // path suffix rather than the full URL also fixes rows saved with a wrong
  // API_URL host.
  private async rewriteUrls(tenantId: number, key: string, url: string): Promise<void> {
    const suffix = `/uploads/${key}`;
    const like = `%${suffix}%`;
    const swap = (v: Json): Json => {
      if (typeof v === 'string') return v.endsWith(suffix) ? url : v;
      if (Array.isArray(v)) return v.map(swap);
      if (v && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
      }
      return v;
    };
    const parse = (v: Json): Json => (typeof v === 'string' ? JSON.parse(v) : v);
    const json = (v: Json) => (v == null ? null : JSON.stringify(v));

    await this.dataSource.query(
      `UPDATE media_files SET url = ? WHERE tenantId = ? AND storedPath = ?`,
      [url, tenantId, key],
    );
    await this.dataSource.query(
      `UPDATE media_files SET thumbnailUrl = ? WHERE tenantId = ? AND thumbnailPath = ?`,
      [url, tenantId, key],
    );

    const props: Array<{ id: number; images: Json; floorPlanUrl: string | null; floorPlans: Json }> =
      await this.dataSource.query(
        `SELECT id, images, floorPlanUrl, floorPlans FROM properties
          WHERE tenantId = ? AND (images LIKE ? OR floorPlanUrl LIKE ? OR floorPlans LIKE ?)`,
        [tenantId, like, like, like],
      );
    for (const p of props) {
      await this.dataSource.query(
        `UPDATE properties SET images = ?, floorPlanUrl = ?, floorPlans = ? WHERE id = ?`,
        [json(swap(parse(p.images))), swap(p.floorPlanUrl), json(swap(parse(p.floorPlans))), p.id],
      );
    }

    const messages: Array<{ id: number; attachments: Json }> = await this.dataSource.query(
      `SELECT m.id, m.attachments FROM ticket_messages m
         JOIN tickets t ON t.id = m.ticketId
        WHERE t.tenantId = ? AND m.attachments LIKE ?`,
      [tenantId, like],
    );
    for (const m of messages) {
      await this.dataSource.query(`UPDATE ticket_messages SET attachments = ? WHERE id = ?`, [
        json(swap(parse(m.attachments))),
        m.id,
      ]);
    }
  }

  private tally(counts: UploadSyncCounts, r: 'moved' | 'failed' | 'missing' | 'gone', streak: number): number {
    if (r === 'moved') counts.moved++;
    if (r === 'failed') counts.failed++;
    if (r === 'missing') counts.missing++;
    return r === 'failed' ? streak + 1 : 0;
  }

  private affected(res: unknown): number {
    return (res as { affectedRows?: number })?.affectedRows ?? 0;
  }
}
