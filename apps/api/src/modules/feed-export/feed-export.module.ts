import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ApiKey,
  ExportFeed,
  FeedExportConfig,
  FeedExportLog,
  Property,
  Location,
  LocationTemplateNode,
  PropertyType,
  Feature,
  Tenant,
  RightmoveListing,
  RightmoveLocation,
  RightmovePushLog,
} from '../../database/entities';
import { FeedExportService } from './feed-export.service';
import { PropertyModule } from '../property/property.module';
import {
  FeedExportConfigController,
  FeedExportController,
} from './feed-export.controller';
import { IdealistaFeedService } from './idealista-feed.service';
import {
  IdealistaConfigController,
  IdealistaFeedController,
} from './idealista-feed.controller';
import { RightmoveClient } from './rightmove/rightmove-client';
import { RightmoveSyncService } from './rightmove/rightmove-sync.service';
import { RightmoveFeedService } from './rightmove/rightmove-feed.service';
import {
  RightmoveConfigController,
  RightmovePlacesAdminController,
} from './rightmove/rightmove.controller';
import { ExportFeedsService } from './export-feeds.service';
import { ExportFeedsController, ExportFeedsPublicController } from './export-feeds.controller';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiKey,
      ExportFeed,
      FeedExportConfig,
      FeedExportLog,
      Property,
      Location,
      LocationTemplateNode,
      PropertyType,
      Feature,
      Tenant,
      RightmoveListing,
      RightmoveLocation,
      RightmovePushLog,
    ]),
    // PropertySearchService: the location/type filter rules shared with website keys.
    PropertyModule,
  ],
  controllers: [
    FeedExportConfigController,
    ExportFeedsController,
    IdealistaConfigController,
    RightmoveConfigController,
    RightmovePlacesAdminController,
    FeedExportController,
    IdealistaFeedController,
    ExportFeedsPublicController,
  ],
  providers: [
    FeedExportService,
    ExportFeedsService,
    IdealistaFeedService,
    RightmoveClient,
    RightmoveSyncService,
    RightmoveFeedService,
    DashboardAddonGuard,
  ],
  exports: [FeedExportService],
})
export class FeedExportModule {}
