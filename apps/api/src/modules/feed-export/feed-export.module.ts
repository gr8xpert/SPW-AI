import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FeedExportConfig,
  FeedExportLog,
  Property,
  Location,
  LocationTemplateNode,
  PropertyType,
  Feature,
  Tenant,
} from '../../database/entities';
import { FeedExportService } from './feed-export.service';
import {
  FeedExportConfigController,
  FeedExportController,
} from './feed-export.controller';
import { IdealistaFeedService } from './idealista-feed.service';
import {
  IdealistaConfigController,
  IdealistaFeedController,
} from './idealista-feed.controller';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedExportConfig,
      FeedExportLog,
      Property,
      Location,
      LocationTemplateNode,
      PropertyType,
      Feature,
      Tenant,
    ]),
  ],
  controllers: [
    FeedExportConfigController,
    IdealistaConfigController,
    FeedExportController,
    IdealistaFeedController,
  ],
  providers: [FeedExportService, IdealistaFeedService, DashboardAddonGuard],
  exports: [FeedExportService],
})
export class FeedExportModule {}
