import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import {
  TenantEmailConfig,
  EmailCampaign,
  EmailTemplate,
  EmailSend,
  Contact,
  Property,
} from '../../database/entities';
import { EmailSenderService } from './email-sender.service';

interface CampaignJob {
  campaignId: number;
  tenantId: number;
}

@Processor('email-campaign')
export class EmailCampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailCampaignProcessor.name);

  constructor(
    @InjectRepository(TenantEmailConfig)
    private configRepository: Repository<TenantEmailConfig>,
    @InjectRepository(EmailCampaign)
    private campaignRepository: Repository<EmailCampaign>,
    @InjectRepository(EmailTemplate)
    private templateRepository: Repository<EmailTemplate>,
    @InjectRepository(EmailSend)
    private sendRepository: Repository<EmailSend>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    private senderService: EmailSenderService,
  ) {
    super();
  }

  async process(job: Job<CampaignJob>): Promise<void> {
    const { campaignId, tenantId } = job.data;
    this.logger.log(`Processing campaign ${campaignId}`);

    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!campaign || campaign.status === 'cancelled') {
      this.logger.log(`Campaign ${campaignId} cancelled or not found`);
      return;
    }

    const config = await this.configRepository.findOne({
      where: { tenantId },
    });

    if (!config || !config.isVerified) {
      this.logger.error(`No verified email config for tenant ${tenantId}`);
      campaign.status = 'cancelled';
      await this.campaignRepository.save(campaign);
      return;
    }

    const template = await this.templateRepository.findOne({
      where: { id: campaign.templateId },
    });

    if (!template) {
      this.logger.error(`Template ${campaign.templateId} not found`);
      return;
    }

    // Get featured properties if any
    let featuredProperties: Property[] = [];
    if (campaign.featuredProperties?.length) {
      featuredProperties = await this.propertyRepository.findByIds(
        campaign.featuredProperties,
      );
    }

    // Get pending sends
    const sends = await this.sendRepository.find({
      where: { campaignId, status: 'pending' },
      relations: ['contact'],
    });

    let sentToday = 0;

    for (const send of sends) {
      // Check if campaign was cancelled
      const currentCampaign = await this.campaignRepository.findOne({
        where: { id: campaignId },
      });
      if (currentCampaign?.status === 'cancelled') {
        this.logger.log(`Campaign ${campaignId} was cancelled, stopping`);
        return;
      }

      // Check daily limit
      if (sentToday >= config.dailyLimit) {
        this.logger.log(`Daily limit reached for tenant ${tenantId}`);
        break;
      }

      // Check if contact is still subscribed
      if (!send.contact.subscribed) {
        send.status = 'failed';
        send.errorMessage = 'Contact unsubscribed';
        await this.sendRepository.save(send);
        continue;
      }

      // Prepare template data
      const templateData = {
        contact: {
          name: send.contact.name || '',
          email: send.contact.email,
        },
        properties: featuredProperties.map((p) => ({
          reference: p.reference,
          title: p.title?.en || '',
          price: p.price,
          bedrooms: p.bedrooms,
          location: p.locationId, // Would need to join to get name
          image: p.images?.[0]?.url || '',
        })),
      };

      // Render and send
      const subject = this.senderService.renderTemplate(
        campaign.subject,
        templateData,
      );
      const html = this.senderService.renderTemplate(
        template.bodyHtml,
        templateData,
      );

      // Add tracking pixel and unsubscribe link
      const trackedHtml = this.addTracking(html, send.id);

      // 6B — pass tenantId so the sender can attach the tenant's verified
      // DKIM key to the transport; unverified tenants fall through unsigned.
      const result = await this.senderService.sendEmail(
        config,
        {
          to: send.contact.email,
          subject,
          html: trackedHtml,
          text: template.bodyText,
        },
        tenantId,
      );

      if (result.success) {
        send.status = 'sent';
        send.sentAt = new Date();
        campaign.sentCount++;
      } else {
        send.status = 'failed';
        send.errorMessage = result.error ?? 'Unknown error';
        campaign.failedCount++;
      }

      await this.sendRepository.save(send);
      await this.campaignRepository.save(campaign);

      sentToday++;

      // Throttle: wait 100ms between emails
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Check if campaign is complete
    const remainingPending = await this.sendRepository.count({
      where: { campaignId, status: 'pending' },
    });

    if (remainingPending === 0) {
      campaign.status = 'sent';
      campaign.completedAt = new Date();
      await this.campaignRepository.save(campaign);
      this.logger.log(`Campaign ${campaignId} completed`);
    }
  }

  private addTracking(html: string, sendId: number): string {
    // Add tracking pixel
    const trackingPixel = `<img src="${process.env.API_URL}/api/track/open/${sendId}" width="1" height="1" style="display:none" />`;

    // Add unsubscribe link
    const unsubscribeLink = `${process.env.API_URL}/api/unsubscribe/${sendId}`;

    // Insert pixel before closing body tag
    let tracked = html.replace('</body>', `${trackingPixel}</body>`);

    // Replace {{unsubscribe_link}} placeholder if exists
    tracked = tracked.replace(/\{\{unsubscribe_link\}\}/g, unsubscribeLink);

    return tracked;
  }
}
