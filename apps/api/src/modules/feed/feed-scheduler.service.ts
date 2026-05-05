import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeedConfig } from '../../database/entities';
import { FeedService } from './feed.service';

@Injectable()
export class FeedSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FeedSchedulerService.name);

  constructor(
    @InjectRepository(FeedConfig)
    private feedConfigRepository: Repository<FeedConfig>,
    private feedService: FeedService,
  ) {}

  onModuleInit() {
    this.logger.log('Feed scheduler initialized');
  }

  /**
   * Check every hour for feeds that need to be synced
   * based on their individual cron schedules
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkScheduledImports(): Promise<void> {
    this.logger.log('Checking for scheduled feed imports');

    const activeConfigs = await this.feedConfigRepository.find({
      where: { isActive: true },
    });

    const now = new Date();

    for (const config of activeConfigs) {
      if (this.shouldSync(config, now)) {
        this.logger.log(`Triggering scheduled sync for feed ${config.id}`);

        try {
          await this.feedService.triggerSync(config.tenantId, config.id);
        } catch (error) {
          this.logger.error(`Failed to trigger sync for feed ${config.id} — will retry once`, error);
          try {
            await new Promise((r) => setTimeout(r, 30_000));
            await this.feedService.triggerSync(config.tenantId, config.id);
          } catch (retryError) {
            this.logger.error(`Retry also failed for feed ${config.id}`, retryError);
          }
        }
      }
    }
  }

  private shouldSync(config: FeedConfig, now: Date): boolean {
    // If never synced, sync now
    if (!config.lastSyncAt) {
      return true;
    }

    // Parse cron and check if it's time
    // For simplicity, we'll use a basic check based on common patterns
    const schedule = config.syncSchedule || '0 2 * * *'; // Default: 2 AM daily
    const lastSync = new Date(config.lastSyncAt);

    // Basic daily check: if more than 23 hours since last sync
    const hoursSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

    if (schedule.includes('* * *')) {
      // Daily pattern
      return hoursSinceLastSync >= 23;
    }

    if (schedule.includes('*/')) {
      // Interval pattern like */6 (every 6 hours)
      const match = schedule.match(/\*\/(\d+)/);
      if (match) {
        const interval = parseInt(match[1], 10);
        return hoursSinceLastSync >= interval;
      }
    }

    // Default: sync if more than 24 hours
    return hoursSinceLastSync >= 24;
  }
}
