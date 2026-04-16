import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PropertyView,
  SearchLog,
  Favorite,
  SavedSearch,
  Property,
  Lead,
} from '../../database/entities';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsController,
  TrackingController,
  FavoritesController,
} from './analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PropertyView,
      SearchLog,
      Favorite,
      SavedSearch,
      Property,
      Lead,
    ]),
  ],
  controllers: [AnalyticsController, TrackingController, FavoritesController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
