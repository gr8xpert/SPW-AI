import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureController } from './feature.controller';
import { PublicFeatureController } from './public-feature.controller';
import { FeatureService } from './feature.service';
import { ReorderModule } from '../reorder/reorder.module';
import { Feature } from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Feature]), ReorderModule, TenantModule],
  controllers: [FeatureController, PublicFeatureController],
  providers: [FeatureService, ApiKeyThrottlerGuard],
  exports: [FeatureService],
})
export class FeatureModule {}
