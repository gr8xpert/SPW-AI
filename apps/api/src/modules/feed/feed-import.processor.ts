import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { FeedService } from './feed.service';

interface FeedImportJobData {
  configId: number;
  importLogId: number;
  tenantId: number;
}

@Processor('feed-import', { concurrency: 2 })
export class FeedImportProcessor extends WorkerHost {
  private readonly logger = new Logger(FeedImportProcessor.name);

  constructor(private readonly feedService: FeedService) {
    super();
  }

  async process(job: Job<FeedImportJobData>): Promise<void> {
    const { configId, importLogId, tenantId } = job.data;

    this.logger.log(`Starting feed import for config ${configId}, tenant ${tenantId}`);

    try {
      await this.feedService.processImport(configId, importLogId);
      this.logger.log(`Feed import completed for config ${configId}`);
    } catch (error) {
      this.logger.error(`Feed import failed for config ${configId}`, error);
      throw error;
    }
  }
}
