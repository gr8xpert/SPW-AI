import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RedisLockService } from '../../common/redis/redis-lock.service';
import { MAILERLITE_QUEUE, MailerLiteConnectionService } from './mailerlite-connection.service';
import { MailerLiteSyncService, SLICE_MS } from './mailerlite-sync.service';

// Longer than one piece of a run plus its slowest calls.
const LOCK_MS = SLICE_MS + 3 * 60_000;
const LOCK_BUSY_DELAY_MS = 60_000;

export interface MailerLiteJob {
  tenantId: number;
}

// One piece of one client's run per job; the lock keeps it to one at a time per
// client. Rate limits are per MailerLite account, so clients don't slow each other.
@Processor(MAILERLITE_QUEUE, { concurrency: 2 })
export class MailerLiteProcessor extends WorkerHost {
  private readonly logger = new Logger(MailerLiteProcessor.name);

  constructor(
    private readonly sync: MailerLiteSyncService,
    private readonly connections: MailerLiteConnectionService,
    private readonly lock: RedisLockService,
  ) {
    super();
  }

  async process(job: Job<MailerLiteJob>): Promise<void> {
    const { tenantId } = job.data;
    try {
      const outcome = await this.lock.withLock(`mailerlite-sync:${tenantId}`, LOCK_MS, () => this.sync.runSlice(tenantId));
      if (!outcome.acquired) {
        await this.connections.addJob(tenantId, LOCK_BUSY_DELAY_MS);
        return;
      }
      if (outcome.result?.kind === 'continue') {
        await this.connections.addJob(tenantId, outcome.result.delayMs);
      }
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`MailerLite sync of tenant ${tenantId}, try ${job.attemptsMade + 1}: ${message}`);
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) await this.sync.markFailed(tenantId, message);
      throw err;
    }
  }
}
