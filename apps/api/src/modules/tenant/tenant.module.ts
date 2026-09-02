import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantController } from './tenant.controller';
import { PublicSyncMetaController } from './public-sync-meta.controller';
import { PublicWidgetConfigController } from './public-widget-config.controller';
import { TenantService } from './tenant.service';
import { TierPolicyService } from './tier-policy.service';
import { Tenant, WebhookDelivery } from '../../database/entities';
import { WebhookModule } from '../webhook/webhook.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, WebhookDelivery]), WebhookModule],
  controllers: [TenantController, PublicSyncMetaController, PublicWidgetConfigController],
  providers: [TenantService, TierPolicyService, ApiKeyThrottlerGuard],
  exports: [TenantService, TierPolicyService],
})
export class TenantModule {}
