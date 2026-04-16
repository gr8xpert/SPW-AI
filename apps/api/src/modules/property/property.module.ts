import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyController } from './property.controller';
import { PublicPropertyController } from './public-property.controller';
import { PropertyService } from './property.service';
import { PropertySearchService } from './property-search.service';
import { Property } from '../../database/entities';
import { LocationModule } from '../location/location.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TypeOrmModule.forFeature([Property]), LocationModule, TenantModule],
  controllers: [PropertyController, PublicPropertyController],
  providers: [PropertyService, PropertySearchService],
  exports: [PropertyService, PropertySearchService],
})
export class PropertyModule {}
