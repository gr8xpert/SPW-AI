import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiSearchUsage, Tenant } from '../../database/entities';
import { AiService } from './ai.service';
import { AiSearchService } from './ai-search.service';
import { OpenRouterCatalogService } from './openrouter-catalog.service';
import { AiModelsController } from './ai-models.controller';
import { PublicAiSearchController } from './public-ai-search.controller';
import { TenantModule } from '../tenant/tenant.module';
import { LocationModule } from '../location/location.module';
import { PropertyTypeModule } from '../property-type/property-type.module';
import { FeatureModule } from '../feature/feature.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, AiSearchUsage]),
    TenantModule,
    LocationModule,
    PropertyTypeModule,
    FeatureModule,
  ],
  controllers: [AiModelsController, PublicAiSearchController],
  providers: [AiService, AiSearchService, OpenRouterCatalogService],
  exports: [AiService, AiSearchService, OpenRouterCatalogService],
})
export class AiModule {}
