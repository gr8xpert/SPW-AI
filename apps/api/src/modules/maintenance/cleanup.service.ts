import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { RefreshToken, WebhookDelivery } from '../../database/entities';
import { RedisLockService } from '../../common/redis/redis-lock.service';

// Retention windows. Expired+revoked refresh tokens have no functional value
// after the access-token lifetime elapses; we keep a week to aid incident
// forensics. Webhook delivery rows are kept for 30 days so operators can
// replay from the dashboard — long enough for most downstreams to notice an
// outage, short enough to bound table growth.
const REFRESH_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const WEBHOOK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Distributed lock key + TTL. The TTL is an upper bound on how long a single
// cleanup run could take — a generous 10 min covers a very large refresh-token
// table being pruned under slow-io conditions. If the holder crashes, the TTL
// auto-releases. Cron fires daily, so worst-case one day's run is skipped if
// a holder hangs past the TTL — acceptable.
const CLEANUP_LOCK_KEY = 'cron:cleanup';
const CLEANUP_LOCK_TTL_MS = 10 * 60 * 1000;

interface CleanupCounts {
  refreshTokens: number;
  webhookDeliveries: number;
}

export interface ScheduledCleanupOutcome {
  executed: boolean;
  counts?: CleanupCounts;
}

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(WebhookDelivery)
    private readonly webhookRepo: Repository<WebhookDelivery>,
    private readonly lock: RedisLockService,
  ) {}

  // Daily at 03:30 local — off-peak for most production traffic. Every API
  // replica runs its own scheduler, so without coordination all of them would
  // race the same DELETE queries at the same second. The Redis SET NX PX
  // lock ensures exactly one replica executes; the rest observe "skipped".
  @Cron('30 3 * * *')
  async scheduledCleanup(): Promise<ScheduledCleanupOutcome> {
    const outcome = await this.lock.withLock(
      CLEANUP_LOCK_KEY,
      CLEANUP_LOCK_TTL_MS,
      () => this.runCleanup(),
    );
    if (outcome.acquired && outcome.result) {
      this.logger.log(
        `scheduled cleanup: pruned ${outcome.result.refreshTokens} refresh_tokens, ${outcome.result.webhookDeliveries} webhook_deliveries`,
      );
      return { executed: true, counts: outcome.result };
    }
    this.logger.log(
      'scheduled cleanup: skipped (another replica holds the lock, or redis unavailable)',
    );
    return { executed: false };
  }

  // Exposed separately so tests can invoke the purge without waiting for
  // the cron, and so an admin endpoint could trigger it on demand later.
  // Intentionally *unlocked*: callers that need coordination go via
  // scheduledCleanup(); direct callers (tests, admin) are assumed to know
  // what they're doing.
  async runCleanup(now: Date = new Date()): Promise<CleanupCounts> {
    const refreshCutoff = new Date(now.getTime() - REFRESH_TOKEN_RETENTION_MS);
    const webhookCutoff = new Date(now.getTime() - WEBHOOK_RETENTION_MS);

    // Refresh tokens: only prune ones that are both past their TTL AND
    // revoked. An un-revoked expired token is technically still queryable
    // for reuse-detection audits — its removal would create a false
    // negative in "was this token ever issued?" checks.
    const refreshResult = await this.refreshTokenRepo
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :cutoff', { cutoff: refreshCutoff })
      .andWhere('revokedAt IS NOT NULL')
      .execute();

    const webhookResult = await this.webhookRepo.delete({
      createdAt: LessThan(webhookCutoff),
    });

    return {
      refreshTokens: refreshResult.affected ?? 0,
      webhookDeliveries: webhookResult.affected ?? 0,
    };
  }
}
