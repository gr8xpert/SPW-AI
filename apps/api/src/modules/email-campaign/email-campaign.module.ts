import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import {
  TenantEmailConfig,
  TenantEmailDomain,
  EmailTemplate,
  EmailCampaign,
  EmailSend,
  Contact,
  Property,
  Tenant,
  EmailTemplateVersion,
  EmailTemplateAiMessage,
  TenantBrandMemory,
  EmailImage,
} from '../../database/entities';
import { EmailCampaignService } from './email-campaign.service';
import { EmailSenderService } from './email-sender.service';
import { EmailCampaignProcessor } from './email-campaign.processor';
import { CampaignContentService } from './campaign-content.service';
import { CampaignTrackingService } from './campaign-tracking.service';
import { CampaignTrackingController } from './campaign-tracking.controller';
import {
  EmailConfigController,
  EmailTemplateController,
  CampaignController,
} from './email-campaign.controller';
import { TemplateVersionService } from './designer/template-version.service';
import { EmailTemplateDesignController, EmailImageController, EmailDesignerController } from './designer/email-designer.controller';
import { EmailDesignerService } from './designer/email-designer.service';
import { BrandMemoryService } from './designer/brand-memory.service';
import { AiModule } from '../ai/ai.module';
import { EmailImageService } from './designer/email-image.service';
import { DesignerCleanupService } from './designer/designer-cleanup.service';
import { UploadModule } from '../upload/upload.module';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [
    UploadModule,
    AiModule,
    TypeOrmModule.forFeature([
      TenantEmailConfig,
      TenantEmailDomain,
      EmailTemplate,
      EmailCampaign,
      EmailSend,
      Contact,
      Property,
      Tenant,
      EmailTemplateVersion,
      EmailTemplateAiMessage,
      TenantBrandMemory,
      EmailImage,
    ]),
    BullModule.registerQueue({
      name: 'email-campaign',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    }),
  ],
  controllers: [
    EmailConfigController,
    EmailTemplateController,
    CampaignController,
    CampaignTrackingController,
    EmailTemplateDesignController,
    EmailImageController,
    EmailDesignerController,
  ],
  providers: [
    EmailCampaignService,
    EmailSenderService,
    EmailCampaignProcessor,
    CampaignContentService,
    CampaignTrackingService,
    TemplateVersionService,
    EmailImageService,
    DesignerCleanupService,
    BrandMemoryService,
    EmailDesignerService,
    DashboardAddonGuard,
  ],
  exports: [EmailCampaignService, EmailSenderService],
})
export class EmailCampaignModule {}
