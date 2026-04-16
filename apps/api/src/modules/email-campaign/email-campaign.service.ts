import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  TenantEmailConfig,
  EmailTemplate,
  EmailCampaign,
  EmailSend,
  Contact,
} from '../../database/entities';
import { EmailSenderService } from './email-sender.service';
import {
  CreateEmailConfigDto,
  UpdateEmailConfigDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto';

@Injectable()
export class EmailCampaignService {
  constructor(
    @InjectRepository(TenantEmailConfig)
    private configRepository: Repository<TenantEmailConfig>,
    @InjectRepository(EmailTemplate)
    private templateRepository: Repository<EmailTemplate>,
    @InjectRepository(EmailCampaign)
    private campaignRepository: Repository<EmailCampaign>,
    @InjectRepository(EmailSend)
    private sendRepository: Repository<EmailSend>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectQueue('email-campaign')
    private campaignQueue: Queue,
    private senderService: EmailSenderService,
  ) {}

  // ============ Email Config ============
  async getConfig(tenantId: number): Promise<TenantEmailConfig | null> {
    return this.configRepository.findOne({ where: { tenantId } });
  }

  async createOrUpdateConfig(
    tenantId: number,
    dto: CreateEmailConfigDto | UpdateEmailConfigDto,
  ): Promise<TenantEmailConfig> {
    let config = await this.configRepository.findOne({ where: { tenantId } });

    if (config) {
      Object.assign(config, dto);
    } else {
      config = this.configRepository.create({
        ...dto,
        tenantId,
      });
    }

    return this.configRepository.save(config);
  }

  async testConfig(tenantId: number): Promise<{ success: boolean; error?: string }> {
    const config = await this.getConfig(tenantId);
    if (!config) {
      return { success: false, error: 'Email configuration not found' };
    }

    const success = await this.senderService.testConnection(config);

    if (success) {
      config.isVerified = true;
      config.verifiedAt = new Date();
      await this.configRepository.save(config);
    }

    return { success, error: success ? undefined : 'Connection test failed' };
  }

  // ============ Templates ============
  async createTemplate(tenantId: number, dto: CreateTemplateDto): Promise<EmailTemplate> {
    if (dto.isDefault) {
      // Unset other defaults of same type
      await this.templateRepository.update(
        { tenantId, type: dto.type, isDefault: true },
        { isDefault: false },
      );
    }

    const template = this.templateRepository.create({
      ...dto,
      tenantId,
    });

    return this.templateRepository.save(template);
  }

  async findAllTemplates(tenantId: number): Promise<EmailTemplate[]> {
    return this.templateRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findTemplate(tenantId: number, id: number): Promise<EmailTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id, tenantId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  async updateTemplate(
    tenantId: number,
    id: number,
    dto: UpdateTemplateDto,
  ): Promise<EmailTemplate> {
    const template = await this.findTemplate(tenantId, id);

    if (dto.isDefault) {
      await this.templateRepository.update(
        { tenantId, type: template.type, isDefault: true },
        { isDefault: false },
      );
    }

    Object.assign(template, dto);
    return this.templateRepository.save(template);
  }

  async deleteTemplate(tenantId: number, id: number): Promise<void> {
    const template = await this.findTemplate(tenantId, id);

    // Check if template is used by any campaign
    const campaignCount = await this.campaignRepository.count({
      where: { templateId: id },
    });

    if (campaignCount > 0) {
      throw new BadRequestException('Template is used by campaigns and cannot be deleted');
    }

    await this.templateRepository.remove(template);
  }

  async previewTemplate(
    tenantId: number,
    id: number,
    data: Record<string, any>,
  ): Promise<{ subject: string; html: string }> {
    const template = await this.findTemplate(tenantId, id);

    return {
      subject: this.senderService.renderTemplate(template.subject, data),
      html: this.senderService.renderTemplate(template.bodyHtml, data),
    };
  }

  // ============ Campaigns ============
  async createCampaign(tenantId: number, dto: CreateCampaignDto): Promise<EmailCampaign> {
    const template = await this.findTemplate(tenantId, dto.templateId);

    const campaign = this.campaignRepository.create({
      tenantId,
      templateId: dto.templateId,
      name: dto.name,
      subject: dto.subject || template.subject,
      recipientFilter: dto.recipientFilter ?? null,
      featuredProperties: dto.featuredProperties ?? null,
      status: 'draft' as const,
    } as Partial<EmailCampaign>);

    if (dto.scheduledAt) {
      campaign.scheduledAt = new Date(dto.scheduledAt);
    }

    return this.campaignRepository.save(campaign);
  }

  async findAllCampaigns(tenantId: number): Promise<EmailCampaign[]> {
    return this.campaignRepository.find({
      where: { tenantId },
      relations: ['template'],
      order: { createdAt: 'DESC' },
    });
  }

  async findCampaign(tenantId: number, id: number): Promise<EmailCampaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id, tenantId },
      relations: ['template'],
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  async updateCampaign(
    tenantId: number,
    id: number,
    dto: UpdateCampaignDto,
  ): Promise<EmailCampaign> {
    const campaign = await this.findCampaign(tenantId, id);

    if (campaign.status !== 'draft') {
      throw new BadRequestException('Can only edit draft campaigns');
    }

    Object.assign(campaign, {
      name: dto.name,
      subject: dto.subject,
      recipientFilter: dto.recipientFilter,
      featuredProperties: dto.featuredProperties,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : campaign.scheduledAt,
    });

    return this.campaignRepository.save(campaign);
  }

  async startCampaign(tenantId: number, id: number): Promise<EmailCampaign> {
    const campaign = await this.findCampaign(tenantId, id);

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new BadRequestException(`Cannot start campaign with status ${campaign.status}`);
    }

    // Get recipient count
    const recipients = await this.getRecipients(tenantId, campaign.recipientFilter);
    campaign.totalRecipients = recipients.length;
    campaign.status = 'sending';
    campaign.startedAt = new Date();

    await this.campaignRepository.save(campaign);

    // Create send records and queue emails
    for (const contact of recipients) {
      const send = this.sendRepository.create({
        campaignId: campaign.id,
        contactId: contact.id,
        status: 'pending',
      });
      await this.sendRepository.save(send);
    }

    // Queue the campaign processing
    await this.campaignQueue.add('process-campaign', {
      campaignId: campaign.id,
      tenantId,
    });

    return campaign;
  }

  async cancelCampaign(tenantId: number, id: number): Promise<EmailCampaign> {
    const campaign = await this.findCampaign(tenantId, id);

    if (campaign.status !== 'sending' && campaign.status !== 'scheduled') {
      throw new BadRequestException(`Cannot cancel campaign with status ${campaign.status}`);
    }

    campaign.status = 'cancelled';
    return this.campaignRepository.save(campaign);
  }

  async getCampaignStats(tenantId: number, id: number): Promise<{
    total: number;
    sent: number;
    failed: number;
    opened: number;
    clicked: number;
    unsubscribed: number;
  }> {
    await this.findCampaign(tenantId, id);

    const stats = await this.sendRepository
      .createQueryBuilder('send')
      .select('send.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('send.campaignId = :id', { id })
      .groupBy('send.status')
      .getRawMany();

    const opened = await this.sendRepository.count({
      where: { campaignId: id, openedAt: true as any },
    });

    const clicked = await this.sendRepository.count({
      where: { campaignId: id, clickedAt: true as any },
    });

    const unsubscribed = await this.sendRepository.count({
      where: { campaignId: id, unsubscribedAt: true as any },
    });

    const result = {
      total: 0,
      sent: 0,
      failed: 0,
      opened,
      clicked,
      unsubscribed,
    };

    for (const stat of stats) {
      result.total += parseInt(stat.count);
      if (stat.status === 'sent') result.sent = parseInt(stat.count);
      if (stat.status === 'failed' || stat.status === 'bounced') {
        result.failed += parseInt(stat.count);
      }
    }

    return result;
  }

  private async getRecipients(
    tenantId: number,
    filter: Record<string, any> | null,
  ): Promise<Contact[]> {
    const query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenantId = :tenantId', { tenantId })
      .andWhere('contact.subscribed = true');

    if (filter?.tags?.length) {
      for (const tag of filter.tags) {
        query.andWhere(`JSON_CONTAINS(contact.tags, '"${tag}"')`);
      }
    }

    if (filter?.locations?.length) {
      query.andWhere(
        `JSON_OVERLAPS(JSON_EXTRACT(contact.preferences, '$.locations'), :locations)`,
        { locations: JSON.stringify(filter.locations) },
      );
    }

    return query.getMany();
  }
}
