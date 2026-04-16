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
    }),
    ScheduleModule.forRoot(),
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
