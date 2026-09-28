import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location, LocationTemplateNode, LocationTemplateUnmatched, Property } from '../../database/entities';
import { LocationModule } from '../location/location.module';
import { AiEnrichmentModule } from '../ai-enrichment/ai-enrichment.module';
import { LocationTemplateService } from './location-template.service';
import { LocationTemplateController } from './location-template.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([LocationTemplateNode, LocationTemplateUnmatched, Location, Property]),
    LocationModule,
    AiEnrichmentModule,
  ],
  controllers: [LocationTemplateController],
  providers: [LocationTemplateService],
  exports: [LocationTemplateService],
})
export class LocationTemplateModule {}
