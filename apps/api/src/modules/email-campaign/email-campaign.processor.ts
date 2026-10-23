import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';
import {
  TenantEmailConfig,
  EmailCampaign,
  EmailTemplate,
  EmailSend,
} from '../../database/entities';
import { EmailSenderService } from './email-sender.service';
import { EmailCampaignService } from './email-campaign.service';
import { CampaignContentService } from './campaign-content.service';
import { EmailImageService } from './designer/email-image.service';
import { campaignLinks } from './campaign-links';

interface CampaignJob {
  campaignId: number;
  tenantId: number;
  // Set on a scheduled start; the job is ignored when the campaign was
  // rescheduled to another time since.
  scheduledFor?: string;
}

// Emails per batch; the campaign's status is re-read between batches so a
// cancel stops it within one batch.
const BATCH = 50;
// Pause between two emails, to stay friendly with the client's mail server.
const THROTTLE_MS = 100;

@Processor('email-campaign', { concurrency: 3 })
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
    @InjectQueue('email-campaign')
    private campaignQueue: Queue,
    private senderService: EmailSenderService,
    private campaignService: EmailCampaignService,
    private content: CampaignContentService,
    private images: EmailImageService,
  ) {
    super();
  }

  async process(job: Job<CampaignJob>): Promise<void> {
    const { campaignId, tenantId, scheduledFor } = job.data;

    let campaign = await this.campaignRepository.findOne({ where: { id: campaignId, tenantId } });
    if (!campaign) return;

    if (campaign.status === 'scheduled') {
      const started = await this.campaignService.startScheduled(campaignId, tenantId, scheduledFor);
      if (!started) return;
      campaign = await this.campaignRepository.findOne({ where: { id: campaignId, tenantId } });
      if (!campaign) return;
    }
    if (campaign.status !== 'sending') {
      this.logger.log(`Campaign ${campaignId} is ${campaign.status}; nothing to send`);
      return;
    }
    this.logger.log(`Processing campaign ${campaignId}`);

    const config = await this.configRepository.findOne({ where: { tenantId } });
    const template = await this.templateRepository.findOne({ where: { id: campaign.templateId, tenantId } });
    if (!config || !template) {
      this.logger.error(`Campaign ${campaignId}: ${!config ? 'no email config' : 'template missing'}; stopped`);
      await this.campaignRepository.update({ id: campaignId }, { status: 'cancelled', completedAt: new Date() });
      return;
    }
    // Sent emails keep showing their pictures: never clean these up.
    await this.images.pin(tenantId, template.bodyHtml);

    const ctx = await this.content.context(tenantId, campaign.featuredProperties);
    const subject = campaign.subject;

    for (;;) {
      const left = config.dailyLimit - (await this.sentToday(tenantId));
      if (left <= 0) {
        await this.continueTomorrow(campaignId, tenantId);
        return;
      }

      const sends = await this.sendRepository.find({
        where: { campaignId, status: 'pending' },
        relations: ['contact'],
        order: { id: 'ASC' },
        take: Math.min(BATCH, left),
      });
      if (!sends.length) break;

      const current = await this.campaignRepository.findOne({ where: { id: campaignId }, select: ['id', 'status'] });
      if (current?.status !== 'sending') {
        this.logger.log(`Campaign ${campaignId} was ${current?.status ?? 'deleted'}, stopping`);
        return;
      }

      for (const send of sends) {
        await this.sendOne(send, ctx, config, { subject, bodyHtml: template.bodyHtml, bodyText: template.bodyText }, campaignId, tenantId);
        await new Promise((resolve) => setTimeout(resolve, THROTTLE_MS));
      }
    }

    const remainingPending = await this.sendRepository.count({ where: { campaignId, status: 'pending' } });
    if (remainingPending === 0) {
      await this.campaignRepository.update({ id: campaignId, status: 'sending' }, { status: 'sent', completedAt: new Date() });
      this.logger.log(`Campaign ${campaignId} completed`);
    }
  }

  private async sendOne(
    send: EmailSend,
    ctx: Awaited<ReturnType<CampaignContentService['context']>>,
    config: TenantEmailConfig,
    template: { subject: string; bodyHtml: string; bodyText: string | null },
    campaignId: number,
    tenantId: number,
  ): Promise<void> {
    const contact = send.contact;
    // The contact was deleted or unsubscribed after the campaign started.
    if (!contact || !contact.subscribed) {
      await this.sendRepository.update({ id: send.id }, { status: 'failed', errorMessage: contact ? 'Contact unsubscribed' : 'Contact deleted' });
      await this.campaignRepository.increment({ id: campaignId }, 'failedCount', 1);
      return;
    }

    const links = campaignLinks(send.id);
    const out = this.content.render(
      ctx,
      template,
      { name: contact.name, email: contact.email, language: contact.preferences?.language ?? null },
      links,
    );

    // 6B — pass tenantId so the sender can attach the tenant's verified
    // DKIM key to the transport; unverified tenants fall through unsigned.
    const result = await this.senderService.sendEmail(
      config,
      {
        to: contact.email,
        subject: out.subject,
        html: out.html,
        text: out.text,
        headers: {
          'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      },
      tenantId,
    );

    if (result.success) {
      await this.sendRepository.update({ id: send.id }, { status: 'sent', sentAt: new Date() });
      await this.campaignRepository.increment({ id: campaignId }, 'sentCount', 1);
      await this.sendRepository.manager.query('UPDATE contacts SET lastEmailAt = NOW() WHERE id = ?', [contact.id]);
    } else {
      await this.sendRepository.update({ id: send.id }, { status: 'failed', errorMessage: (result.error ?? 'Unknown error').slice(0, 1000) });
      await this.campaignRepository.increment({ id: campaignId }, 'failedCount', 1);
    }
  }

  // Campaign emails this tenant sent since midnight (server time), across
  // all its campaigns: the email settings' daily limit.
  private async sentToday(tenantId: number): Promise<number> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return this.sendRepository
      .createQueryBuilder('send')
      .innerJoin('send.campaign', 'campaign')
      .where('campaign.tenantId = :tenantId', { tenantId })
      .andWhere('send.sentAt >= :midnight', { midnight })
      .getCount();
  }

  // The daily limit was reached: the rest goes out after midnight.
  private async continueTomorrow(campaignId: number, tenantId: number): Promise<void> {
    const next = new Date();
    next.setHours(24, 5, 0, 0);
    this.logger.log(`Daily limit reached for tenant ${tenantId}; campaign ${campaignId} continues at ${next.toISOString()}`);
    await this.campaignQueue.add(
      'process-campaign',
      { campaignId, tenantId },
      { delay: next.getTime() - Date.now(), jobId: `campaign-${campaignId}-resume-${next.getTime()}` },
    );
  }
}
