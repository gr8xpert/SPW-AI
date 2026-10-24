import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BuyerAlert, BuyerQuestion, BuyerSend, BuyerStage, BuyerTrip, BuyerViewing, MetaLeadSource, MetaLead, BuyerTask, Contact, Feature, Lead, LeadActivity, LeadAgent, LeadChange, LeadFile, LeadSuggestion, LeadSuggestionEvent, Location, Property, PropertyType, SiteCheckin, Tenant, User,
} from '../../database/entities';
import { LeadService } from './lead.service';
import { LeadScoringService } from './lead-scoring.service';
import { LeadStatsController } from './lead-stats.controller';
import { InquiryController, ShareFavoritesController, VisitorCountryController } from './website-forms.controller';
import { FormMailService } from './form-mail.service';
import { BuyerController } from './buyer/buyer.controller';
import { NewLeadController } from './buyer/new-lead.controller';
import { NewLeadService } from './buyer/new-lead.service';
import { BuyerService } from './buyer/buyer.service';
import { BuyerStageService } from './buyer/buyer-stage.service';
import { BuyerSettingsService } from './buyer/buyer-settings.service';
import { BuyerQuestionService } from './buyer/buyer-question.service';
import { BuyerTaskService } from './buyer/buyer-task.service';
import { BuyerFileService } from './buyer/buyer-file.service';
import { BuyerFollowUpController } from './buyer/buyer-follow-up.controller';
import { BuyerMatchController } from './buyer/buyer-match.controller';
import { BuyerMatchService } from './buyer/buyer-match.service';
import { BuyerSuggestionService } from './buyer/buyer-suggestion.service';
import { BuyerMailService } from './buyer/buyer-mail.service';
import { BuyerSendService } from './buyer/buyer-send.service';
import { BuyerWhatsAppService } from './buyer/whatsapp/buyer-whatsapp.service';
import { BuyerIntakeService } from './buyer/buyer-intake.service';
import { BuyerFormMailService } from './buyer/buyer-form-mail.service';
import { BuyerImportController } from './buyer/odoo/buyer-import.controller';
import { BuyerTrackingController } from './buyer/tracking/buyer-tracking.controller';
import { BuyerTrackingService } from './buyer/tracking/buyer-tracking.service';
import { BuyerChangeLogService } from './buyer/buyer-change-log.service';
import { BuyerPageController, BuyerPageFallbackController, PublicBuyerPageController } from './buyer/page/buyer-page.controller';
import { BuyerPageService } from './buyer/page/buyer-page.service';
import { BuyerNearMissService } from './buyer/buyer-near-miss.service';
import { BuyerReverseService } from './buyer/buyer-reverse.service';
import { BuyerAlertController } from './buyer/alerts/buyer-alert.controller';
import { BuyerAlertService } from './buyer/alerts/buyer-alert.service';
import { BuyerAlertScheduler } from './buyer/alerts/buyer-alert.scheduler';
import { BuyerViewingController } from './buyer/viewings/buyer-viewing.controller';
import { BuyerViewingService } from './buyer/viewings/buyer-viewing.service';
import { BuyerViewingMailService } from './buyer/viewings/buyer-viewing-mail.service';
import { BuyerHotService } from './buyer/buyer-hot.service';
import { BuyerHomeService } from './buyer/digest/buyer-home.service';
import { BuyerReportsService } from './buyer/reports/buyer-reports.service';
import { BuyerHousekeepingService } from './buyer/housekeeping/buyer-housekeeping.service';
import { BuyerGdprService } from './buyer/housekeeping/buyer-gdpr.service';
import { BuyerHousekeepingController } from './buyer/housekeeping/buyer-housekeeping.controller';
import { MetaLeadService } from './meta/meta-lead.service';
import { MetaLeadController } from './meta/meta-lead.controller';
import { BuyerDigestService } from './buyer/digest/buyer-digest.service';
import { BuyerPageMailService } from './buyer/page/buyer-page-mail.service';
import { BuyerMatchProcessor } from './buyer/buyer-match.processor';
import { BUYER_MATCH_QUEUE } from './buyer/buyer-match.queue';
import { BuyerImportService } from './buyer/odoo/buyer-import.service';
import { PublicBuyerQuestionsController, PublicBuyerWishlistController } from './buyer/buyer-public.controller';
import { PropertyModule } from '../property/property.module';
import { BrochureModule } from '../brochure/brochure.module';
import { LabelModule } from '../label/label.module';
import { TranslationMemoryModule } from '../translation-memory/translation-memory.module';
import { UploadModule } from '../upload/upload.module';
import { ContactModule } from '../contact/contact.module';
import { TenantModule } from '../tenant/tenant.module';
import { WebhookModule } from '../webhook/webhook.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ApiKeyThrottlerGuard } from '../../common/guards/api-key-throttler.guard';
import { AiModule } from '../ai/ai.module';
import { BuyerAiController } from './buyer/ai/buyer-ai.controller';
import { BuyerAiService } from './buyer/ai/buyer-ai.service';
import { BuyerRuleCheckService } from './buyer/ai/buyer-rule-check.service';
import { BuyerAiInsightService } from './buyer/ai/buyer-ai-insight.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lead, LeadActivity, LeadAgent, LeadChange, BuyerSend, LeadSuggestionEvent, BuyerAlert, BuyerTrip, BuyerViewing, MetaLeadSource, MetaLead, BuyerStage, BuyerTask, LeadFile, LeadSuggestion, BuyerQuestion, Contact, Feature, Location, Property, PropertyType, SiteCheckin, Tenant, User,
    ]),
    BullModule.registerQueue({
      name: BUYER_MATCH_QUEUE,
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 200 },
    }),
    UploadModule,
    ContactModule,
    TenantModule,
    WebhookModule,
    AnalyticsModule,
    PropertyModule,
    BrochureModule,
    LabelModule,
    TranslationMemoryModule,
    AiModule,
  ],
  // BuyerImportController, BuyerFollowUpController and BuyerMatchController
  // first: their static routes (import/…, board, tasks/…, suggestions/…)
  // must win over BuyerController's /:id.
  controllers: [
    BuyerAiController, BuyerImportController, BuyerAlertController, BuyerViewingController, BuyerHousekeepingController, MetaLeadController, BuyerFollowUpController, BuyerMatchController, BuyerPageController, BuyerController, NewLeadController, LeadStatsController, InquiryController, ShareFavoritesController, VisitorCountryController,
    PublicBuyerQuestionsController, PublicBuyerWishlistController, BuyerTrackingController,
    PublicBuyerPageController, BuyerPageFallbackController,
  ],
  providers: [
    LeadService,
    LeadScoringService,
    FormMailService,
    BuyerService,
    BuyerStageService,
    BuyerSettingsService,
    NewLeadService,
    BuyerQuestionService,
    BuyerTaskService,
    BuyerFileService,
    BuyerMatchService,
    BuyerSuggestionService,
    BuyerMailService,
    BuyerSendService,
    BuyerWhatsAppService,
    BuyerIntakeService,
    BuyerFormMailService,
    BuyerImportService,
    BuyerTrackingService,
    BuyerChangeLogService,
    BuyerPageService,
    BuyerPageMailService,
    BuyerNearMissService,
    BuyerReverseService,
    BuyerAlertService,
    BuyerAlertScheduler,
    BuyerViewingService,
    BuyerViewingMailService,
    BuyerHotService,
    BuyerHomeService,
    BuyerReportsService,
    BuyerHousekeepingService,
    BuyerGdprService,
    MetaLeadService,
    BuyerDigestService,
    BuyerMatchProcessor,
    BuyerAiService,
    BuyerRuleCheckService,
    BuyerAiInsightService,
    ApiKeyThrottlerGuard,
  ],
  exports: [LeadService],
})
export class LeadModule {}
