import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  TenantEmailConfig,
  EmailTemplate,
  EmailCampaign,
  EmailSend,
  Contact,
  Property,
} from '../../database/entities';
import { EmailSenderService } from './email-sender.service';
import { CampaignContentService } from './campaign-content.service';
import { checkTemplate } from './template-check';
import { TemplateVersionService } from './designer/template-version.service';
import { EmailImageService } from './designer/email-image.service';
import {
  CreateEmailConfigDto,
  UpdateEmailConfigDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  RecipientFilterDto,
} from './dto';

// Secrets never leave the API; the dashboard only learns whether one is set.
export type PublicEmailConfig = Omit<TenantEmailConfig, 'smtpPassword' | 'apiKey' | 'tenant'> & {
  hasSmtpPassword: boolean;
  hasApiKey: boolean;
};

const SAMPLE_CONTACT = { name: 'Sample Contact', email: 'sample@example.com', language: null };
const INSERT_CHUNK = 500;

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
    @InjectRepository(Property)
    private propertyRepository: Repository<Property>,
    @InjectQueue('email-campaign')
    private campaignQueue: Queue,
    private senderService: EmailSenderService,
    private content: CampaignContentService,
    private versions: TemplateVersionService,
    private images: EmailImageService,
  ) {}

  // ============ Email Config ============
  async getConfig(tenantId: number): Promise<PublicEmailConfig | null> {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    return config ? this.toPublicConfig(config) : null;
  }

  private toPublicConfig(config: TenantEmailConfig): PublicEmailConfig {
    const { smtpPassword, apiKey, tenant: _tenant, ...rest } = config;
    return { ...rest, hasSmtpPassword: !!smtpPassword, hasApiKey: !!apiKey };
  }

  async createOrUpdateConfig(
    tenantId: number,
    dto: CreateEmailConfigDto | UpdateEmailConfigDto,
  ): Promise<PublicEmailConfig> {
    // A blank secret means "keep the saved one" (the form never shows it).
    const changes: Partial<TenantEmailConfig> = {};
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      if ((k === 'smtpPassword' || k === 'apiKey') && v === '') continue;
      (changes as Record<string, unknown>)[k] = v;
    }

    let config = await this.configRepository.findOne({ where: { tenantId } });
    if (config) {
      const transportKeys: (keyof TenantEmailConfig)[] = ['provider', 'smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 'smtpEncryption', 'apiKey', 'apiDomain'];
      const transportChanged = transportKeys.some((k) => k in changes && changes[k] !== config![k]);
      Object.assign(config, changes);
      if (transportChanged) {
        config.isVerified = false;
        config.verifiedAt = null as unknown as Date;
      }
    } else {
      config = this.configRepository.create({ ...changes, tenantId });
    }

    return this.toPublicConfig(await this.configRepository.save(config));
  }

  async testConfig(tenantId: number): Promise<{ success: boolean; error?: string }> {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    if (!config) {
      return { success: false, error: 'Email configuration not found' };
    }

    const result = await this.senderService.testConnection(config);

    if (result.success) {
      config.isVerified = true;
      config.verifiedAt = new Date();
      await this.configRepository.save(config);
    }

    return result.success ? { success: true } : { success: false, error: result.error || 'Connection test failed' };
  }

  // The saved config, checked against the mail server when it was never
  // checked (or its settings changed since).
  private async readyConfig(tenantId: number): Promise<TenantEmailConfig> {
    const config = await this.configRepository.findOne({ where: { tenantId } });
    if (!config) {
      throw new BadRequestException({ code: 'NO_EMAIL_CONFIG', message: 'Set up your email server first (Settings → Email).' });
    }
    if (!config.isVerified) {
      const test = await this.testConfig(tenantId);
      if (!test.success) {
        throw new BadRequestException({ code: 'EMAIL_CONFIG_FAILED', message: `Your email server did not accept the connection: ${test.error}` });
      }
      config.isVerified = true;
    }
    return config;
  }

  // ============ Templates ============
  // The stored HTML is always the cleaned one; broken loops or huge bodies are refused.
  private cleanBody(bodyHtml: string): string {
    const check = checkTemplate(bodyHtml);
    if (check.errors.length) {
      throw new BadRequestException({
        code: 'TEMPLATE_INVALID',
        message: `The template has errors: ${check.errors.join(' ')}`,
        details: { errors: check.errors },
      });
    }
    return check.html;
  }

  async createTemplate(tenantId: number, dto: CreateTemplateDto): Promise<EmailTemplate> {
    // Validate before any write, so a refused body never unsets the current default.
    const bodyHtml = this.cleanBody(dto.bodyHtml ?? '');
    // Clearing the old default, the save and the first version: all or nothing.
    const saved = await this.templateRepository.manager.transaction(async (em) => {
      const repo = em.getRepository(EmailTemplate);
      if (dto.isDefault) {
        // Unset other defaults of same type
        await repo.update({ tenantId, type: dto.type, isDefault: true }, { isDefault: false });
      }
      const row = await repo.save(repo.create({ ...dto, bodyHtml, tenantId }));
      await this.versions.record(tenantId, row.id, { bodyHtml: row.bodyHtml, subject: row.subject, source: 'manual' }, em);
      return row;
    });
    await this.images.touch(tenantId, saved.bodyHtml);
    return saved;
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
    const cleaned = dto.bodyHtml !== undefined ? this.cleanBody(dto.bodyHtml) : undefined;
    const before = { bodyHtml: template.bodyHtml, subject: template.subject };

    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) (template as unknown as Record<string, unknown>)[k] = v;
    }
    if (cleaned !== undefined) template.bodyHtml = cleaned;
    // Clearing the old default, the save and its versions: all or nothing.
    const saved = await this.templateRepository.manager.transaction(async (em) => {
      const repo = em.getRepository(EmailTemplate);
      if (dto.isDefault) {
        await repo.update({ tenantId, type: template.type, isDefault: true }, { isDefault: false });
      }
      // Templates made before the designer existed have no history: keep their
      // pre-edit state so it can be restored.
      if (!(await this.versions.hasAny(tenantId, id, em))) {
        await this.versions.record(tenantId, id, { ...before, source: 'manual' }, em);
      }
      const row = await repo.save(template);
      await this.versions.record(tenantId, row.id, { bodyHtml: row.bodyHtml, subject: row.subject, source: 'manual' }, em);
      return row;
    });
    await this.images.touch(tenantId, saved.bodyHtml);
    return saved;
  }

  async deleteTemplate(tenantId: number, id: number): Promise<void> {
    const template = await this.findTemplate(tenantId, id);

    const campaignCount = await this.campaignRepository.count({
      where: { tenantId, templateId: id },
    });

    if (campaignCount > 0) {
      throw new BadRequestException('Template is used by campaigns and cannot be deleted');
    }

    await this.templateRepository.remove(template);
  }

  async previewTemplate(
    tenantId: number,
    id: number,
  ): Promise<{ subject: string; html: string }> {
    const template = await this.findTemplate(tenantId, id);
    const ctx = await this.content.context(tenantId, []);
    const out = this.content.render(ctx, template, SAMPLE_CONTACT, { pixelUrl: null, unsubscribeUrl: '#', propertyUrl: null });
    return { subject: out.subject, html: out.html };
  }

  // ============ Campaigns ============
  private async resolveFeatured(
    tenantId: number,
    ids: number[] | undefined,
    references: string[] | undefined,
  ): Promise<number[] | null | undefined> {
    if (references !== undefined) {
      const refs = [...new Set(references.map((r) => r.trim()).filter(Boolean))];
      if (!refs.length) return null;
      const rows = await this.propertyRepository.find({
        where: [{ tenantId, reference: In(refs) }, { tenantId, agentReference: In(refs) }],
        select: ['id', 'reference', 'agentReference'],
      });
      const found = new Map<string, number>();
      for (const r of rows) {
        found.set(r.reference.toLowerCase(), r.id);
        if (r.agentReference) found.set(r.agentReference.toLowerCase(), r.id);
      }
      const missing = refs.filter((r) => !found.has(r.toLowerCase()));
      if (missing.length) {
        throw new BadRequestException({ code: 'UNKNOWN_REFERENCES', message: `No listing with reference: ${missing.join(', ')}`, references: missing });
      }
      return [...new Set(refs.map((r) => found.get(r.toLowerCase())!))];
    }
    if (ids !== undefined) {
      if (!ids.length) return null;
      const count = await this.propertyRepository.count({ where: { tenantId, id: In(ids) } });
      if (count !== new Set(ids).size) throw new BadRequestException('Unknown featured listing');
      return [...new Set(ids)];
    }
    return undefined;
  }

  private cleanFilter(filter: RecipientFilterDto | undefined): Record<string, any> | null {
    if (!filter) return null;
    const tags = (filter.tags || []).map((t) => t.trim()).filter(Boolean);
    const locations = (filter.locations || []).filter((n) => Number.isInteger(n) && n > 0);
    if (!tags.length && !locations.length) return null;
    return { ...(tags.length ? { tags } : {}), ...(locations.length ? { locations } : {}) };
  }

  async createCampaign(tenantId: number, dto: CreateCampaignDto): Promise<EmailCampaign> {
    const template = await this.findTemplate(tenantId, dto.templateId);
    const featured = await this.resolveFeatured(tenantId, dto.featuredProperties, dto.featuredReferences);

    const campaign = this.campaignRepository.create({
      tenantId,
      templateId: dto.templateId,
      name: dto.name,
      subject: dto.subject || template.subject,
      recipientFilter: this.cleanFilter(dto.recipientFilter),
      featuredProperties: featured ?? null,
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

  // The campaign with what the detail page shows next to it.
  async getCampaignDetail(tenantId: number, id: number) {
    const campaign = await this.findCampaign(tenantId, id);
    const [featured, config] = await Promise.all([
      this.content.featured(tenantId, campaign.featuredProperties),
      this.configRepository.findOne({ where: { tenantId }, select: ['id', 'dailyLimit', 'isVerified', 'fromEmail'] }),
    ]);
    const matching = campaign.status === 'draft' || campaign.status === 'scheduled'
      ? await this.countRecipients(tenantId, campaign.recipientFilter)
      : null;
    return {
      ...campaign,
      featured,
      matchingRecipients: matching,
      emailConfig: config ? { fromEmail: config.fromEmail, dailyLimit: config.dailyLimit, isVerified: config.isVerified } : null,
    };
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

    if (dto.templateId !== undefined && dto.templateId !== campaign.templateId) {
      await this.findTemplate(tenantId, dto.templateId);
      campaign.templateId = dto.templateId;
      campaign.template = undefined as unknown as EmailTemplate;
    }
    if (dto.name !== undefined) campaign.name = dto.name;
    if (dto.subject !== undefined && dto.subject.trim()) campaign.subject = dto.subject;
    if (dto.recipientFilter !== undefined) campaign.recipientFilter = this.cleanFilter(dto.recipientFilter) as Record<string, any>;
    const featured = await this.resolveFeatured(tenantId, dto.featuredProperties, dto.featuredReferences);
    if (featured !== undefined) campaign.featuredProperties = featured as number[];
    if (dto.scheduledAt !== undefined) campaign.scheduledAt = new Date(dto.scheduledAt);

    await this.campaignRepository.save(campaign);
    return this.findCampaign(tenantId, id);
  }

  async deleteCampaign(tenantId: number, id: number): Promise<void> {
    const campaign = await this.findCampaign(tenantId, id);
    if (campaign.status === 'sending') {
      throw new BadRequestException('Cancel the campaign before deleting it');
    }
    await this.campaignRepository.delete({ id, tenantId });
  }

  async duplicateCampaign(tenantId: number, id: number): Promise<EmailCampaign> {
    const source = await this.findCampaign(tenantId, id);
    const copy = this.campaignRepository.create({
      tenantId,
      templateId: source.templateId,
      name: `${source.name} (copy)`.slice(0, 100),
      subject: source.subject,
      recipientFilter: source.recipientFilter,
      featuredProperties: source.featuredProperties,
      status: 'draft' as const,
    } as Partial<EmailCampaign>);
    return this.campaignRepository.save(copy);
  }

  // Sends now: the recipient list is fixed at this moment.
  async startCampaign(tenantId: number, id: number): Promise<EmailCampaign> {
    const campaign = await this.findCampaign(tenantId, id);
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new BadRequestException(`Cannot start campaign with status ${campaign.status}`);
    }
    await this.readyConfig(tenantId);
    const count = await this.countRecipients(tenantId, campaign.recipientFilter);
    if (!count) {
      throw new BadRequestException({ code: 'NO_RECIPIENTS', message: 'No subscribed contacts match this campaign.' });
    }

    // Claimed with a conditional update, so a double click sends once.
    const claimed = await this.campaignRepository.update(
      { id, tenantId, status: In(['draft', 'scheduled']) },
      { status: 'sending', startedAt: new Date(), scheduledAt: null as unknown as Date },
    );
    if (!claimed.affected) {
      throw new BadRequestException('The campaign is already being sent');
    }

    await this.materializeSends(campaign.id, tenantId, campaign.recipientFilter);
    await this.campaignQueue.add('process-campaign', { campaignId: campaign.id, tenantId });
    return this.findCampaign(tenantId, id);
  }

  async scheduleCampaign(tenantId: number, id: number, scheduledAt: string): Promise<EmailCampaign> {
    const campaign = await this.findCampaign(tenantId, id);
    if (campaign.status !== 'draft') {
      throw new BadRequestException('Only a draft campaign can be scheduled');
    }
    const when = new Date(scheduledAt);
    const delay = when.getTime() - Date.now();
    if (!Number.isFinite(delay) || delay < 60_000) {
      throw new BadRequestException('Pick a time at least a minute from now');
    }
    if (delay > 90 * 24 * 3600_000) {
      throw new BadRequestException('Pick a time within the next 90 days');
    }
    await this.readyConfig(tenantId);

    campaign.status = 'scheduled';
    campaign.scheduledAt = when;
    await this.campaignRepository.save(campaign);
    await this.campaignQueue.add(
      'process-campaign',
      { campaignId: campaign.id, tenantId, scheduledFor: when.toISOString() },
      { delay, jobId: `campaign-${campaign.id}-${when.getTime()}` },
    );
    return this.findCampaign(tenantId, id);
  }

  // A scheduled campaign whose time came: fixes its recipients and starts.
  // Returns false when it is no longer waiting (cancelled, rescheduled, sent).
  async startScheduled(campaignId: number, tenantId: number, scheduledFor: string | undefined): Promise<boolean> {
    const campaign = await this.campaignRepository.findOne({ where: { id: campaignId, tenantId } });
    if (!campaign || campaign.status !== 'scheduled') return false;
    if (scheduledFor && campaign.scheduledAt && Math.abs(campaign.scheduledAt.getTime() - new Date(scheduledFor).getTime()) > 1000) {
      return false;
    }
    const claimed = await this.campaignRepository.update(
      { id: campaignId, tenantId, status: 'scheduled' },
      { status: 'sending', startedAt: new Date() },
    );
    if (!claimed.affected) return false;
    await this.materializeSends(campaignId, tenantId, campaign.recipientFilter);
    return true;
  }

  // One pending email_sends row per recipient (the campaign's fixed list).
  private async materializeSends(campaignId: number, tenantId: number, filter: Record<string, any> | null): Promise<void> {
    const ids = await this.recipientQuery(tenantId, filter).select('contact.id', 'id').getRawMany<{ id: number }>();
    for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
      const chunk = ids.slice(i, i + INSERT_CHUNK).map((r) => ({ campaignId, contactId: Number(r.id), status: 'pending' as const }));
      await this.sendRepository.createQueryBuilder().insert().values(chunk).updateEntity(false).execute();
    }
    await this.campaignRepository.update({ id: campaignId }, { totalRecipients: ids.length });
  }

  async cancelCampaign(tenantId: number, id: number): Promise<EmailCampaign> {
    const campaign = await this.findCampaign(tenantId, id);

    if (campaign.status !== 'sending' && campaign.status !== 'scheduled') {
      throw new BadRequestException(`Cannot cancel campaign with status ${campaign.status}`);
    }

    // A scheduled campaign goes back to draft (nothing was sent yet); a
    // campaign that is sending stops where it is.
    const next = campaign.status === 'scheduled' ? 'draft' : 'cancelled';
    await this.campaignRepository.update(
      { id, tenantId },
      next === 'draft' ? { status: next, scheduledAt: null as unknown as Date } : { status: next, completedAt: new Date() },
    );
    return this.findCampaign(tenantId, id);
  }

  // A test email of the campaign to one address, without tracking.
  async sendTest(tenantId: number, id: number, email: string): Promise<{ sent: boolean }> {
    const campaign = await this.findCampaign(tenantId, id);
    const config = await this.readyConfig(tenantId);
    const ctx = await this.content.context(tenantId, campaign.featuredProperties);
    const contact = await this.contactRepository.findOne({ where: { tenantId, email } });
    const out = this.content.render(
      ctx,
      { subject: campaign.subject, bodyHtml: campaign.template.bodyHtml, bodyText: campaign.template.bodyText },
      { name: contact?.name ?? SAMPLE_CONTACT.name, email, language: contact?.preferences?.language ?? null },
      { pixelUrl: null, unsubscribeUrl: '#', propertyUrl: null },
    );
    const result = await this.senderService.sendEmail(config, { to: email, subject: `[Test] ${out.subject}`, html: out.html, text: out.text }, tenantId);
    if (!result.success) {
      throw new BadRequestException({ code: 'SEND_FAILED', message: `The test email was not sent: ${result.error}` });
    }
    // The test email shows the template images: keep them 30 more days (not pinned: no campaign went out).
    await this.images.touch(tenantId, campaign.template?.bodyHtml ?? '');
    return { sent: true };
  }

  async previewCampaign(tenantId: number, id: number): Promise<{ subject: string; html: string }> {
    const campaign = await this.findCampaign(tenantId, id);
    const ctx = await this.content.context(tenantId, campaign.featuredProperties);
    const out = this.content.render(
      ctx,
      { subject: campaign.subject, bodyHtml: campaign.template.bodyHtml, bodyText: campaign.template.bodyText },
      SAMPLE_CONTACT,
      { pixelUrl: null, unsubscribeUrl: '#', propertyUrl: null },
    );
    return { subject: out.subject, html: out.html };
  }

  async getCampaignStats(tenantId: number, id: number): Promise<{
    total: number;
    pending: number;
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

    const [opened, clicked, unsubscribed] = await Promise.all([
      this.sendRepository.count({ where: { campaignId: id, openedAt: Not(IsNull()) } }),
      this.sendRepository.count({ where: { campaignId: id, clickedAt: Not(IsNull()) } }),
      this.sendRepository.count({ where: { campaignId: id, unsubscribedAt: Not(IsNull()) } }),
    ]);

    const result = { total: 0, pending: 0, sent: 0, failed: 0, opened, clicked, unsubscribed };

    for (const stat of stats) {
      const n = parseInt(stat.count, 10);
      result.total += n;
      if (stat.status === 'sent') result.sent = n;
      if (stat.status === 'pending') result.pending = n;
      if (stat.status === 'failed' || stat.status === 'bounced') result.failed += n;
    }

    return result;
  }

  async listRecipients(
    tenantId: number,
    id: number,
    page = 1,
    limit = 25,
    status?: string,
  ) {
    await this.findCampaign(tenantId, id);
    const take = Math.min(Math.max(limit, 1), 100);
    const qb = this.sendRepository
      .createQueryBuilder('send')
      .leftJoin('send.contact', 'contact')
      .select([
        'send.id', 'send.status', 'send.sentAt', 'send.openedAt', 'send.clickedAt', 'send.unsubscribedAt', 'send.errorMessage',
        'contact.id', 'contact.email', 'contact.name',
      ])
      .where('send.campaignId = :id', { id })
      .orderBy('send.id', 'ASC')
      .skip((Math.max(page, 1) - 1) * take)
      .take(take);
    if (status === 'opened') qb.andWhere('send.openedAt IS NOT NULL');
    else if (status === 'clicked') qb.andWhere('send.clickedAt IS NOT NULL');
    else if (status === 'unsubscribed') qb.andWhere('send.unsubscribedAt IS NOT NULL');
    else if (status === 'failed') qb.andWhere('send.status IN (:...failed)', { failed: ['failed', 'bounced', 'complained'] });
    else if (status) qb.andWhere('send.status = :status', { status });
    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((s) => ({
        id: s.id,
        status: s.status,
        sentAt: s.sentAt,
        openedAt: s.openedAt,
        clickedAt: s.clickedAt,
        unsubscribedAt: s.unsubscribedAt,
        errorMessage: s.errorMessage,
        contact: s.contact ? { id: s.contact.id, email: s.contact.email, name: s.contact.name } : null,
      })),
      meta: { total, page: Math.max(page, 1), limit: take, pages: Math.ceil(total / take) },
    };
  }

  // The tags the subscriber list uses, for the campaign's audience picker.
  async listTags(tenantId: number): Promise<string[]> {
    const rows = await this.contactRepository
      .createQueryBuilder('contact')
      .select('contact.tags', 'tags')
      .where('contact.tenantId = :tenantId', { tenantId })
      .andWhere('contact.tags IS NOT NULL')
      .getRawMany<{ tags: string | string[] | null }>();
    const set = new Set<string>();
    for (const r of rows) {
      let tags = r.tags;
      if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch { tags = null; }
      }
      if (Array.isArray(tags)) for (const t of tags) if (typeof t === 'string' && t.trim()) set.add(t.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  async countRecipients(tenantId: number, filter: Record<string, any> | null | undefined): Promise<number> {
    return this.recipientQuery(tenantId, filter ?? null).getCount();
  }

  async countForFilter(tenantId: number, filter: RecipientFilterDto | undefined): Promise<{ count: number }> {
    return { count: await this.countRecipients(tenantId, this.cleanFilter(filter)) };
  }

  private recipientQuery(tenantId: number, filter: Record<string, any> | null) {
    const query = this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.tenantId = :tenantId', { tenantId })
      .andWhere('contact.subscribed = true');

    const tags: unknown[] = Array.isArray(filter?.tags) ? filter!.tags : [];
    tags.filter((t): t is string => typeof t === 'string').forEach((tag, i) => {
      query.andWhere(`JSON_CONTAINS(contact.tags, :tag${i})`, { [`tag${i}`]: JSON.stringify(tag) });
    });

    const locations: unknown[] = Array.isArray(filter?.locations) ? filter!.locations : [];
    const locIds = locations.filter((n): n is number => Number.isInteger(n));
    if (locIds.length) {
      query.andWhere(
        `JSON_OVERLAPS(JSON_EXTRACT(contact.preferences, '$.locations'), :locations)`,
        { locations: JSON.stringify(locIds) },
      );
    }

    return query;
  }
}
