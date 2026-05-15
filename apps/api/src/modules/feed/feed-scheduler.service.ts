import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { parseExpression } from 'cron-parser';
import { FeedConfig } from '../../database/entities';
import { FeedService } from './feed.service';
import { RedisLockService } from '../../common/redis/redis-lock.service';

@Injectable()
export class FeedSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FeedSchedulerService.name);

  constructor(
    @InjectRepository(FeedConfig)
    private feedConfigRepository: Repository<FeedConfig>,
    private feedService: FeedService,
    private readonly lockService: RedisLockService,
  ) {}

  onModuleInit() {
    this.logger.log('Feed scheduler initialized');
  }

  /**
   * Check every hour for feeds that need to be synced
   * based on their individual cron schedules.
   *
   * Wrapped in a Redis lock so that under PM2 cluster mode (or any multi-
   * replica deployment) only one instance executes the scan per hour. Without
   * this, each replica's @Cron tick would race to enqueue the same feed.
   * The deterministic jobId in triggerSync() would catch the duplicate at the
   * BullMQ layer, but the running FeedImportLog row would still be created
   * twice — this lock avoids that wasted DB work.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkScheduledImports(): Promise<void> {
    const outcome = await this.lockService.withLock(
      'feed-scheduler:hourly-scan',
      // 5-minute TTL — comfortably longer than a normal scan, short enough that
      // a crashed holder doesn't block the next hourly tick.
      5 * 60_000,
      () => this.runScheduledImports(),
    );
    if (!outcome.acquired) {
      this.logger.log('Feed scheduler tick already running on another replica; skipping');
    }
  }

  private async runScheduledImports(): Promise<void> {
    this.logger.log('Checking for scheduled feed imports');

    const activeConfigs = await this.feedConfigRepository.find({
      where: { isActive: true },
    });

    const now = new Date();

    for (const config of activeConfigs) {
      if (this.shouldSync(config, now)) {
        this.logger.log(`Triggering scheduled sync for feed ${config.id}`);

        try {
          // Pass the current scheduling window so duplicate ticks within the
          // same hour collapse to a single BullMQ job via the deterministic
          // jobId computed downstream.
          await this.feedService.triggerSync(config.tenantId, config.id, {
            scheduledWindow: this.windowKey(now),
          });
        } catch (error) {
          this.logger.error(`Failed to trigger sync for feed ${config.id} — will retry once`, error);
          try {
            await new Promise((r) => setTimeout(r, 30_000));
            await this.feedService.triggerSync(config.tenantId, config.id, {
              scheduledWindow: this.windowKey(now),
            });
          } catch (retryError) {
            this.logger.error(`Retry also failed for feed ${config.id}`, retryError);
          }
        }
      }
    }
  }

  // Hour-bucketed window identifier (yyyymmddhh). Two ticks in the same hour
  // produce the same window — used downstream as part of BullMQ's jobId so
  // duplicates collapse instead of enqueuing twice.
  private windowKey(d: Date): string {
    const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = d.getUTCDate().toString().padStart(2, '0');
    const hh = d.getUTCHours().toString().padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}`;
  }

  // Cron-driven schedule check. Uses cron-parser to walk the schedule's
  // previous fire time from "now" — if the most recent fire is after the
  // last successful sync, this hour's tick should run.
  //
  // Examples (UTC):
  //   "0 2 * * *"  → 2:00 every day. At 02:30 with lastSyncAt=yesterday's
  //                  3:00, prev fire (today 02:00) > lastSyncAt → fire.
  //   "*/4 * * * *"→ every 4 hours. lastSyncAt < (now rounded down to a
  //                  multiple of 4h) → fire.
  //   "0 * * * *"  → top of every hour. Catches a missed hour the same way.
  //
  // Falls back to "fire" on parse error so a tenant with a typo'd schedule
  // still syncs (logged once per occurrence). Validation is enforced at
  // save time so this fallback is rare in practice.
  private shouldSync(config: FeedConfig, now: Date): boolean {
    if (!config.lastSyncAt) {
      return true;
    }

    const schedule = config.syncSchedule || '0 2 * * *'; // Default: 2 AM daily UTC

    try {
      const interval = parseExpression(schedule, { currentDate: now, tz: 'UTC' });
      const prevFire = interval.prev().toDate();
      return prevFire > new Date(config.lastSyncAt);
    } catch (err) {
      this.logger.warn(
        `Invalid cron expression on feed config ${config.id}: "${schedule}" — falling back to 24h check (${(err as Error).message})`,
      );
      const hoursSinceLastSync = (now.getTime() - new Date(config.lastSyncAt).getTime()) / 3_600_000;
      return hoursSinceLastSync >= 24;
    }
  }
}
