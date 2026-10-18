import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyController } from './property.controller';
import { PublicPropertyController } from './public-property.controller';
import { PublicPropertyRefsController } from './public-property-refs.controller';
import { PropertyService } from './property.service';
import { PropertySearchService } from './property-search.service';
import { Property, User, Location, PropertyType, Tenant, Plan } from '../../database/entities';
import { LocationModule } from '../location/location.module';
import { TenantModule } from '../tenant/tenant.module';
import { WebhookModule } from '../webhook/webhook.module';
import { LabelModule } from '../label/label.module';
import { PropertyTitleService } from './property-title.service';
import { PropertyTitleInterceptor } from './property-title.interceptor';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Property, User, Location, PropertyType, Tenant, Plan]), LocationModule, TenantModule, WebhookModule, LabelModule],
  controllers: [PropertyController, PublicPropertyController, PublicPropertyRefsController],
  providers: [PropertyService, PropertySearchService, PropertyTitleService, PropertyTitleInterceptor, ApiKeyThrottlerGuard, DashboardAddonGuard],
  exports: [PropertyService, PropertySearchService],
})
export class PropertyModule {}
