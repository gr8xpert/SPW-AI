import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuppeteerPoolService } from './puppeteer-pool.service';
import { BrochureCacheService } from './brochure-cache.service';
import { BrochureService } from './brochure.service';
import { BrochureController } from './brochure.controller';
import { Tenant } from '../../database/entities/tenant.entity';
import { PropertyModule } from '../property/property.module';
import { TenantModule } from '../tenant/tenant.module';
import { LabelModule } from '../label/label.module';
import { FeatureModule } from '../feature/feature.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), PropertyModule, TenantModule, LabelModule, FeatureModule],
  controllers: [BrochureController],
  providers: [PuppeteerPoolService, BrochureCacheService, BrochureService, ApiKeyThrottlerGuard],
  exports: [BrochureService],
})
export class BrochureModule {}
