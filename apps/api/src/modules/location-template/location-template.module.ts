import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location, LocationTemplateNode, LocationTemplateUnmatched, Property } from '../../database/entities';
import { LocationModule } from '../location/location.module';
import { AiEnrichmentModule } from '../ai-enrichment/ai-enrichment.module';
import { TenantModule } from '../tenant/tenant.module';
import { LocationTemplateService } from './location-template.service';
import { LocationTemplateController } from './location-template.controller';
import { UnmatchedReviewService } from './unmatched-review.service';
import { TemplateAutoFillService } from './template-autofill.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocationTemplateNode, LocationTemplateUnmatched, Location, Property]),
    LocationModule,
    AiEnrichmentModule,
    // Template apply/merge bumps each affected client's syncVersion.
    TenantModule,
  ],
  controllers: [LocationTemplateController],
  providers: [LocationTemplateService, UnmatchedReviewService, TemplateAutoFillService],
  exports: [LocationTemplateService],
})
export class LocationTemplateModule {}
