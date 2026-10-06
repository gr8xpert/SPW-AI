import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead, LeadActivity, Property, SiteCheckin } from '../../database/entities';
import { LeadService } from './lead.service';
import { LeadScoringService } from './lead-scoring.service';
import { LeadController } from './lead.controller';
import { InquiryController, ShareFavoritesController, VisitorCountryController } from './website-forms.controller';
import { FormMailService } from './form-mail.service';
import { ContactModule } from '../contact/contact.module';
import { TenantModule } from '../tenant/tenant.module';
import { WebhookModule } from '../webhook/webhook.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, LeadActivity, Property, SiteCheckin]),
    ContactModule,
    TenantModule,
    WebhookModule,
    AnalyticsModule,
  ],
  controllers: [LeadController, InquiryController, ShareFavoritesController, VisitorCountryController],
  providers: [LeadService, LeadScoringService, FormMailService, ApiKeyThrottlerGuard],
  exports: [LeadService],
})
export class LeadModule {}
