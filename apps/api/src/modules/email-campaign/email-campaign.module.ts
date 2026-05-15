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
} from '../../database/entities';
import { EmailCampaignService } from './email-campaign.service';
import { EmailSenderService } from './email-sender.service';
import { EmailCampaignProcessor } from './email-campaign.processor';
import {
  EmailConfigController,
  EmailTemplateController,
  CampaignController,
} from './email-campaign.controller';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEmailConfig,
      TenantEmailDomain,
      EmailTemplate,
      EmailCampaign,
      EmailSend,
      Contact,
      Property,
      Tenant,
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
  ],
  providers: [EmailCampaignService, EmailSenderService, EmailCampaignProcessor, DashboardAddonGuard],
  exports: [EmailCampaignService, EmailSenderService],
})
export class EmailCampaignModule {}
