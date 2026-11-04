import { Processor, WorkerHost } from '@nestjs/bullmq';
import { DelayedError, Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FEED_RETRY_DELAYS_MS, FeedRetryLaterError } from './feed-retry-later';

interface FeedImportJobData {
  configId: number;
  importLogId: number;
  tenantId: number;
  confirmRemoval?: boolean;
  // Times this run was put back because the provider refused it.
  refusedCount?: number;
}

@Processor('feed-import', { concurrency: 2 })
export class FeedImportProcessor extends WorkerHost {
  private readonly logger = new Logger(FeedImportProcessor.name);

  constructor(private readonly feedService: FeedService) {
    super();
  }

  async process(job: Job<FeedImportJobData>, token?: string): Promise<void> {
    const { configId, importLogId, tenantId, confirmRemoval } = job.data;
    const refusedCount = job.data.refusedCount ?? 0;

    this.logger.log(`Starting feed import for config ${configId}, tenant ${tenantId}`);

    try {
      await this.feedService.processImport(configId, importLogId, {
        confirmRemoval,
        retryIfRefused: refusedCount < FEED_RETRY_DELAYS_MS.length,
      });
      this.logger.log(`Feed import completed for config ${configId}`);
    } catch (error) {
      if (error instanceof FeedRetryLaterError) {
        const delay = FEED_RETRY_DELAYS_MS[refusedCount];
        this.logger.warn(`Feed ${configId} refused by provider; trying again in ${delay / 60000} min`);
        await job.updateData({ ...job.data, refusedCount: refusedCount + 1 });
        await job.moveToDelayed(Date.now() + delay, token);
        throw new DelayedError();
      }
      this.logger.error(`Feed import failed for config ${configId}`, error);
      throw error;
    }
  }
}
