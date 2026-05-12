import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyController } from './property.controller';
import { PublicPropertyController } from './public-property.controller';
import { PropertyService } from './property.service';
import { PropertySearchService } from './property-search.service';
import { Property, User, Location, PropertyType } from '../../database/entities';
import { LocationModule } from '../location/location.module';
import { TenantModule } from '../tenant/tenant.module';
import { WebhookModule } from '../webhook/webhook.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Property, User, Location, PropertyType]), LocationModule, TenantModule, WebhookModule],
  controllers: [PropertyController, PublicPropertyController],
  providers: [PropertyService, PropertySearchService, ApiKeyThrottlerGuard],
  exports: [PropertyService, PropertySearchService],
})
export class PropertyModule {}
