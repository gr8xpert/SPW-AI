import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationController } from './location.controller';
import { PublicLocationController } from './public-location.controller';
import { LocationService } from './location.service';
import { ReorderModule } from '../reorder/reorder.module';
import { Location } from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Location]), ReorderModule, TenantModule],
  controllers: [LocationController, PublicLocationController],
  providers: [LocationService, ApiKeyThrottlerGuard],
  exports: [LocationService],
})
export class LocationModule {}
