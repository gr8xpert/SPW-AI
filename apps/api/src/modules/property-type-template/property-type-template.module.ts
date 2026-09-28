import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Property,
  PropertyType,
  PropertyTypeTemplateNode,
  PropertyTypeTemplateUnmatched,
} from '../../database/entities';
import { AiEnrichmentModule } from '../ai-enrichment/ai-enrichment.module';
import { PropertyTypeTemplateService } from './property-type-template.service';
import { PropertyTypeTemplateController } from './property-type-template.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyTypeTemplateNode, PropertyTypeTemplateUnmatched, PropertyType, Property]),
    AiEnrichmentModule,
  ],
  controllers: [PropertyTypeTemplateController],
  providers: [PropertyTypeTemplateService],
  exports: [PropertyTypeTemplateService],
})
export class PropertyTypeTemplateModule {}
