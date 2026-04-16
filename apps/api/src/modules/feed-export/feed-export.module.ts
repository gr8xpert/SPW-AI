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
  providers: [FeedExportService],
  exports: [FeedExportService],
})
export class FeedExportModule {}
