import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MigrationService } from './migration.service';

interface MigrationJob {
  jobId: number;
  tenantId: number;
  conflictHandling: 'skip' | 'overwrite' | 'new_reference';
}

@Processor('migration')
export class MigrationProcessor extends WorkerHost {
  private readonly logger = new Logger(MigrationProcessor.name);

  constructor(private readonly migrationService: MigrationService) {
    super();
  }

  async process(job: Job<MigrationJob>): Promise<void> {
    const { jobId, tenantId, conflictHandling } = job.data;

    this.logger.log(`Processing migration job ${jobId} for tenant ${tenantId}`);

    try {
      await this.migrationService.processJob(jobId, tenantId, conflictHandling);
      this.logger.log(`Migration job ${jobId} completed`);
    } catch (error) {
      this.logger.error(`Migration job ${jobId} failed:`, error);
      throw error;
    }
  }
}
