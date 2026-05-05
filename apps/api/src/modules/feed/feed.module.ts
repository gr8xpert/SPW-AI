import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { FeedSchedulerService } from './feed-scheduler.service';
import { FeedImportProcessor } from './feed-import.processor';
import { ResalesAdapter, InmobaAdapter } from './adapters';
import {
  FeedConfig,
  FeedImportLog,
  Property,
  Location,
  PropertyType,
  Feature,
} from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedConfig,
      FeedImportLog,
      Property,
      Location,
      PropertyType,
      Feature,
    ]),
    BullModule.registerQueue({
      name: 'feed-import',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    }),
    ScheduleModule.forRoot(),
    TenantModule,
    UploadModule,
  ],
  controllers: [FeedController],
  providers: [
    FeedService,
    FeedSchedulerService,
    FeedImportProcessor,
    ResalesAdapter,
    InmobaAdapter,
  ],
  exports: [FeedService],
})
export class FeedModule {}
