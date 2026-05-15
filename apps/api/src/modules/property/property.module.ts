import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyController } from './property.controller';
import { PublicPropertyController } from './public-property.controller';
import { PropertyService } from './property.service';
import { PropertySearchService } from './property-search.service';
import { Property, User, Location, PropertyType, Tenant, Plan } from '../../database/entities';
import { LocationModule } from '../location/location.module';
import { TenantModule } from '../tenant/tenant.module';
import { WebhookModule } from '../webhook/webhook.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';
import { PropertyQuotaService } from './property-quota.service';

@Module({
  imports: [TypeOrmModule.forFeature([Property, User, Location, PropertyType, Tenant, Plan]), LocationModule, TenantModule, WebhookModule],
  controllers: [PropertyController, PublicPropertyController],
  providers: [PropertyService, PropertySearchService, PropertyQuotaService, ApiKeyThrottlerGuard, DashboardAddonGuard],
  exports: [PropertyService, PropertySearchService, PropertyQuotaService],
})
export class PropertyModule {}
