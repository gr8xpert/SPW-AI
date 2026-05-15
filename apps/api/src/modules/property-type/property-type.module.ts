import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropertyTypeController } from './property-type.controller';
import { PublicPropertyTypeController } from './public-property-type.controller';
import { PropertyTypeService } from './property-type.service';
import { ReorderModule } from '../reorder/reorder.module';
import { PropertyType } from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [TypeOrmModule.forFeature([PropertyType]), ReorderModule, TenantModule],
  controllers: [PropertyTypeController, PublicPropertyTypeController],
  providers: [PropertyTypeService, ApiKeyThrottlerGuard],
  exports: [PropertyTypeService],
})
export class PropertyTypeModule {}
