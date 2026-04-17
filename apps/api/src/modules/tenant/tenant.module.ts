import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantController } from './tenant.controller';
import { PublicSyncMetaController } from './public-sync-meta.controller';
import { TenantService } from './tenant.service';
import { Tenant } from '../../database/entities';
import { WebhookModule } from '../webhook/webhook.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant]), WebhookModule],
  controllers: [TenantController, PublicSyncMetaController],
  providers: [TenantService, ApiKeyThrottlerGuard],
  exports: [TenantService],
})
export class TenantModule {}
