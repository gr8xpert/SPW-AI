import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead, LeadActivity } from '../../database/entities';
import { LeadService } from './lead.service';
import { LeadScoringService } from './lead-scoring.service';
import { LeadController, InquiryController, ShareFavoritesController } from './lead.controller';
import { ContactModule } from '../contact/contact.module';
import { TenantModule } from '../tenant/tenant.module';
import { WebhookModule } from '../webhook/webhook.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, LeadActivity]),
    ContactModule,
    TenantModule,
    WebhookModule,
  ],
  controllers: [LeadController, InquiryController, ShareFavoritesController],
  providers: [LeadService, LeadScoringService, ApiKeyThrottlerGuard],
  exports: [LeadService],
})
export class LeadModule {}
