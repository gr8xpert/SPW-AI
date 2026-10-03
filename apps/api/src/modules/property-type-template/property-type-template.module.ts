import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Property,
  PropertyType,
  PropertyTypeTemplateNode,
  PropertyTypeTemplateUnmatched,
} from '../../database/entities';
import { AiEnrichmentModule } from '../ai-enrichment/ai-enrichment.module';
import { TenantModule } from '../tenant/tenant.module';
import { PropertyTypeTemplateService } from './property-type-template.service';
import { PropertyTypeTemplateController } from './property-type-template.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PropertyTypeTemplateNode, PropertyTypeTemplateUnmatched, PropertyType, Property]),
    AiEnrichmentModule,
    // Template apply bumps each affected client's syncVersion.
    TenantModule,
  ],
  controllers: [PropertyTypeTemplateController],
  providers: [PropertyTypeTemplateService],
  exports: [PropertyTypeTemplateService],
})
export class PropertyTypeTemplateModule {}
