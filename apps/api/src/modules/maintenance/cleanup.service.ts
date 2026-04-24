import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { RefreshToken, WebhookDelivery, Ticket, TicketMessage, MediaFile } from '../../database/entities';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { UploadService } from '../upload/upload.service';

const REFRESH_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const WEBHOOK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const TICKET_ATTACHMENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const CLEANUP_LOCK_KEY = 'cron:cleanup';
const CLEANUP_LOCK_TTL_MS = 10 * 60 * 1000;

interface CleanupCounts {
  refreshTokens: number;
  webhookDeliveries: number;
  ticketAttachments: number;
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
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(TicketMessage)
    private readonly ticketMessageRepo: Repository<TicketMessage>,
    @InjectRepository(MediaFile)
    private readonly mediaFileRepo: Repository<MediaFile>,
    private readonly uploadService: UploadService,
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
        `scheduled cleanup: pruned ${outcome.result.refreshTokens} refresh_tokens, ${outcome.result.webhookDeliveries} webhook_deliveries, ${outcome.result.ticketAttachments} ticket_attachments`,
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

    const refreshResult = await this.refreshTokenRepo
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :cutoff', { cutoff: refreshCutoff })
      .andWhere('revokedAt IS NOT NULL')
      .execute();

    const webhookResult = await this.webhookRepo.delete({
      createdAt: LessThan(webhookCutoff),
    });

    const ticketAttachments = await this.cleanupTicketAttachments(now);

    return {
      refreshTokens: refreshResult.affected ?? 0,
      webhookDeliveries: webhookResult.affected ?? 0,
      ticketAttachments,
    };
  }

  private async cleanupTicketAttachments(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - TICKET_ATTACHMENT_RETENTION_MS);

    // Find messages with attachments on resolved/closed tickets older than retention
    const messages = await this.ticketMessageRepo
      .createQueryBuilder('msg')
      .innerJoin('msg.ticket', 'ticket')
      .where('ticket.status IN (:...statuses)', { statuses: ['resolved', 'closed'] })
      .andWhere('(ticket.resolvedAt < :cutoff OR ticket.closedAt < :cutoff)', { cutoff })
      .andWhere('msg.attachments IS NOT NULL')
      .select(['msg.id', 'msg.attachments'])
      .getMany();

    if (!messages.length) return 0;

    let deletedCount = 0;

    for (const msg of messages) {
      if (!Array.isArray(msg.attachments) || !msg.attachments.length) continue;

      for (const attachment of msg.attachments) {
        try {
          const mediaFile = await this.mediaFileRepo.findOne({ where: { url: attachment.url } });
          if (mediaFile) {
            await this.uploadService.deleteFile(mediaFile.tenantId, mediaFile.id);
          }
          deletedCount++;
        } catch (err) {
          this.logger.warn(`Failed to delete ticket attachment ${attachment.url}: ${(err as Error).message}`);
        }
      }

      await this.ticketMessageRepo.update(msg.id, { attachments: null as any });
    }

    return deletedCount;
  }
}
