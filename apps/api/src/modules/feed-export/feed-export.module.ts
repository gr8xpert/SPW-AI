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
  RightmoveListing,
  RightmoveLocation,
  RightmovePushLog,
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
import { RightmoveClient } from './rightmove/rightmove-client';
import { RightmoveSyncService } from './rightmove/rightmove-sync.service';
import { RightmoveFeedService } from './rightmove/rightmove-feed.service';
import {
  RightmoveConfigController,
  RightmovePlacesAdminController,
} from './rightmove/rightmove.controller';
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
      RightmoveListing,
      RightmoveLocation,
      RightmovePushLog,
    ]),
  ],
  controllers: [
    FeedExportConfigController,
    IdealistaConfigController,
    RightmoveConfigController,
    RightmovePlacesAdminController,
    FeedExportController,
    IdealistaFeedController,
  ],
  providers: [
    FeedExportService,
    IdealistaFeedService,
    RightmoveClient,
    RightmoveSyncService,
    RightmoveFeedService,
    DashboardAddonGuard,
  ],
  exports: [FeedExportService],
})
export class FeedExportModule {}
