import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FeedExportConfig,
  FeedExportLog,
  Property,
  Location,
  PropertyType,
  Feature,
  Tenant,
} from '../../database/entities';
import { FeedExportService } from './feed-export.service';
import {
  FeedExportConfigController,
  FeedExportController,
} from './feed-export.controller';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedExportConfig,
      FeedExportLog,
      Property,
      Location,
      PropertyType,
      Feature,
      Tenant,
    ]),
  ],
  controllers: [FeedExportConfigController, FeedExportController],
  providers: [FeedExportService, DashboardAddonGuard],
  exports: [FeedExportService],
})
export class FeedExportModule {}
