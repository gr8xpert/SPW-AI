import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location, LocationTemplateNode, LocationTemplateUnmatched, Property } from '../../database/entities';
import { LocationModule } from '../location/location.module';
import { AiEnrichmentModule } from '../ai-enrichment/ai-enrichment.module';
import { LocationTemplateService } from './location-template.service';
import { LocationTemplateController } from './location-template.controller';
import { UnmatchedReviewService } from './unmatched-review.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocationTemplateNode, LocationTemplateUnmatched, Location, Property]),
    LocationModule,
    AiEnrichmentModule,
  ],
  controllers: [LocationTemplateController],
  providers: [LocationTemplateService, UnmatchedReviewService],
  exports: [LocationTemplateService],
})
export class LocationTemplateModule {}
