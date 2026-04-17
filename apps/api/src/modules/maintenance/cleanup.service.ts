import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { RefreshToken, WebhookDelivery } from '../../database/entities';

// Retention windows. Expired+revoked refresh tokens have no functional value
// after the access-token lifetime elapses; we keep a week to aid incident
// forensics. Webhook delivery rows are kept for 30 days so operators can
// replay from the dashboard — long enough for most downstreams to notice an
// outage, short enough to bound table growth.
const REFRESH_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const WEBHOOK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

interface CleanupCounts {
  refreshTokens: number;
  webhookDeliveries: number;
}

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(WebhookDelivery)
    private readonly webhookRepo: Repository<WebhookDelivery>,
  ) {}

  // Daily at 03:30 local — off-peak for most production traffic. The cron
  // runs on one replica at a time only if Nest's ScheduleModule is tied to
  // a singleton; for multi-replica, this should be gated by a distributed
  // lock (TODO — add redis SET NX EX guard before broader rollout).
  @Cron('30 3 * * *')
  async scheduledCleanup(): Promise<void> {
    const counts = await this.runCleanup();
    this.logger.log(
      `scheduled cleanup: pruned ${counts.refreshTokens} refresh_tokens, ${counts.webhookDeliveries} webhook_deliveries`,
    );
  }

  // Exposed separately so tests can invoke the purge without waiting for
  // the cron, and so an admin endpoint could trigger it on demand later.
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
