import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { IsNull, MoreThan, Not, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Lead, LeadSuggestion, SiteCheckin, Tenant } from '../../../../database/entities';
import { TenantService } from '../../../tenant/tenant.service';
import { titleOf, FormMailService } from '../../form-mail.service';
import { priceText } from '../../../property/price-text';
import { propertyUrlSegment } from '../../../property/property-url';
import { BuyerService } from '../buyer.service';
import type { BuyerViewer } from '../buyer-access';
import { BuyerChangeLogService } from '../buyer-change-log.service';
import { BuyerMatchService } from '../buyer-match.service';
import { BuyerMailService } from '../buyer-mail.service';
import { normalizeBuyerSettings } from '../buyer-settings.service';
import { propertyLink } from '../buyer-mail';
import type { BuyerPropertyCard } from '../buyer-property-card';
import { BuyerTrackingService } from '../tracking/buyer-tracking.service';
import { BUYER_MATCH_QUEUE, FEEDBACK_NOTICE_JOB, feedbackNoticeJob } from '../buyer-match.queue';
import { BuyerPageMailService } from './buyer-page-mail.service';
import type { BuyerPageProperty, BuyerPageView } from './buyer-page-html';
import { agencyHosts, buyerPageLink, newPageCode, onAgencySite, validPageCode } from './page-code';

const MAX_PROPERTIES = 100;
// A plugin page reported longer ago than this is not trusted any more.
const PLUGIN_PAGE_DAYS = 30;

export type PageAction = 'create' | 'enable' | 'disable' | 'renew';
export type FeedbackAction = 'like' | 'reject' | 'clear' | 'viewing';

export interface PageStatus {
  enabled: boolean;
  hasCode: boolean;
  url: string | null;
  // Where the link points: the agency's own page, the WP plugin page, or SPM's.
  via: 'settings' | 'plugin' | 'fallback' | null;
}

export interface PublicPageView extends BuyerPageView {
  properties: (BuyerPageProperty & { slug: string | null })[];
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: 'PAGE_NOT_FOUND', message: 'This link is not active' });
}

// The personal buyer page: the private link (a random code on the buyer),
// what the page shows, and what the buyer does on it.
@Injectable()
export class BuyerPageService {
  private readonly logger = new Logger(BuyerPageService.name);

  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadSuggestion) private readonly suggestions: Repository<LeadSuggestion>,
    @InjectRepository(SiteCheckin) private readonly checkins: Repository<SiteCheckin>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectQueue(BUYER_MATCH_QUEUE) private readonly queue: Queue,
    private readonly tenantService: TenantService,
    private readonly buyers: BuyerService,
    private readonly changeLog: BuyerChangeLogService,
    private readonly matchService: BuyerMatchService,
    private readonly buyerMail: BuyerMailService,
    private readonly formMail: FormMailService,
    private readonly tracking: BuyerTrackingService,
    private readonly pageMail: BuyerPageMailService,
    private readonly config: ConfigService,
  ) {}

  fallbackBase(): string {
    const env = this.config.get<string>('BUYER_PAGE_FALLBACK_BASE');
    if (env && /^https?:\/\//i.test(env)) return env;
    return `${(this.config.get<string>('API_URL') || 'http://localhost:3001').replace(/\/+$/, '')}/p/`;
  }

  // The buyer's code, made on first use. The unique index decides a clash
  // (two processes, or the 1-in-10^17 repeat): then try again.
  async ensureCode(tenantId: number, leadId: number): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const row = await this.leads.findOne({ where: { id: leadId, tenantId }, select: ['id', 'pageCode'] });
      if (!row) throw new NotFoundException('Buyer not found');
      if (row.pageCode) return row.pageCode;
      try {
        // updatedAt = updatedAt: a new link is not an edit of the buyer.
        await this.leads
          .createQueryBuilder()
          .update()
          .set({ pageCode: newPageCode(), updatedAt: () => 'updatedAt' } as never)
          .where('id = :id AND tenantId = :tenantId AND pageCode IS NULL', { id: leadId, tenantId })
          .execute();
      } catch (err) {
        if (!/Duplicate entry/i.test((err as Error).message)) throw err;
      }
    }
    throw new Error('Could not make a buyer page code');
  }

  // The newest page a WordPress plugin reported, only when it is on the
  // agency's own website (domain or websiteUrl): check-in headers come with
  // the public widget key, so an unknown host is never used.
  private async pluginPage(tenant: Tenant): Promise<string | null> {
    const hosts = agencyHosts(tenant.domain, ((tenant.settings || {}) as TenantSettings).websiteUrl);
    if (!hosts.size) return null;
    const rows = await this.checkins.find({
      where: { tenantId: tenant.id, source: 'plugin', buyerPageUrl: Not(IsNull()), lastSeenAt: MoreThan(new Date(Date.now() - PLUGIN_PAGE_DAYS * 86_400_000)) },
      order: { lastSeenAt: 'DESC' },
      take: 20,
    });
    return rows.find((r) => onAgencySite(r.buyerPageUrl, hosts))?.buyerPageUrl ?? null;
  }

  private async link(tenant: Tenant, code: string, lang: string): Promise<{ url: string; via: PageStatus['via'] }> {
    const settings = normalizeBuyerSettings(((tenant.settings || {}) as TenantSettings).buyerMatch);
    const pluginUrl = await this.pluginPage(tenant);
    const url = buyerPageLink(code, lang, { urls: settings.buyerPageUrls, pluginUrl, fallbackBase: this.fallbackBase() });
    const via: PageStatus['via'] = url.startsWith(this.fallbackBase().replace(/\/+$/, '')) ? 'fallback' : settings.buyerPageUrls[lang] || settings.buyerPageUrls.default ? 'settings' : 'plugin';
    return { url, via };
  }

  // The link for an email to this buyer; null when the agent switched it off.
  async linkFor(tenant: Tenant, lead: Pick<Lead, 'id' | 'pageEnabled'>, lang: string): Promise<string | null> {
    if (lead.pageEnabled === false) return null;
    const code = await this.ensureCode(tenant.id, lead.id);
    return (await this.link(tenant, code, lang)).url;
  }

  async status(tenantId: number, viewer: BuyerViewer, id: number): Promise<PageStatus> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    const row = await this.leads.findOne({ where: { id: lead.id, tenantId }, select: ['id', 'pageCode', 'pageEnabled', 'language'] });
    const enabled = row?.pageEnabled !== false;
    if (!row?.pageCode) return { enabled, hasCode: false, url: null, via: null };
    const tenant = await this.tenant(tenantId);
    const { url, via } = await this.link(tenant, row.pageCode, this.langOf(row, tenant));
    return { enabled, hasCode: true, url: enabled ? url : null, via };
  }

  async act(tenantId: number, viewer: BuyerViewer, id: number, action: PageAction): Promise<PageStatus> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    const keep = { updatedAt: () => 'updatedAt' };
    if (action === 'create') {
      await this.ensureCode(tenantId, lead.id);
    } else if (action === 'enable' || action === 'disable') {
      const enabled = action === 'enable';
      if (lead.pageEnabled !== enabled) {
        await this.leads.createQueryBuilder().update().set({ pageEnabled: enabled, ...keep } as never).where('id = :id', { id: lead.id }).execute();
        await this.changeLog.record(tenantId, lead.id, viewer.id, 'dashboard', [{ field: 'pageEnabled', from: !enabled, to: enabled }]);
      }
      if (enabled) await this.ensureCode(tenantId, lead.id);
    } else {
      await this.leads.createQueryBuilder().update().set({ pageCode: null, pageEnabled: true, ...keep } as never).where('id = :id', { id: lead.id }).execute();
      await this.ensureCode(tenantId, lead.id);
      await this.changeLog.record(tenantId, lead.id, viewer.id, 'dashboard', [{ field: 'pageCode', from: 'old link', to: 'new link' }]);
    }
    return this.status(tenantId, viewer, id);
  }

  // ── Public (the buyer) ────────────────────────────────────────────────

  // The buyer behind a code. Unknown, switched off and merged codes all
  // answer the same 404. A site's API key, when sent, must be the same agency's.
  async resolve(code: string, apiKey?: string): Promise<{ tenant: Tenant; lead: Lead }> {
    if (!validPageCode(code)) throw notFound();
    const lead = await this.leads.findOne({ where: { pageCode: code }, relations: { contact: true, assignedToUser: true } });
    if (!lead || !lead.pageEnabled || lead.mergedIntoId) throw notFound();
    if (apiKey) {
      const site = await this.tenantService.findWidgetTenantForRead(apiKey);
      if (!site || site.id !== lead.tenantId) throw new ForbiddenException({ code: 'WRONG_SITE', message: 'This link belongs to another agency' });
    }
    const tenant = await this.tenant(lead.tenantId);
    return { tenant, lead };
  }

  async view(code: string, langParam?: string, apiKey?: string): Promise<PublicPageView & { labels: Record<string, string> }> {
    const { tenant, lead } = await this.resolve(code, apiKey);
    const lang = langParam && /^[a-z]{2}$/.test(langParam) ? langParam : this.langOf(lead, tenant);
    const settings = (tenant.settings || {}) as TenantSettings;
    const labels = await this.buyerMail.labels(tenant.id, lang);
    const rows = await this.suggestions
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId AND s.leadId = :leadId AND s.sentAt IS NOT NULL', { tenantId: tenant.id, leadId: lead.id })
      .orderBy('s.sentAt', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .take(MAX_PROPERTIES * 2)
      .getMany();
    // Only listings still on the website (cards() reads any status, so filter).
    const live = new Set((await this.liveIds(tenant.id, rows.map((r) => r.propertyId))));
    const cards = await this.matchService.cards(tenant.id, rows.filter((r) => live.has(r.propertyId)).map((r) => r.propertyId));
    const patterns = normalizeBuyerSettings(settings.buyerMatch).propertyUrlPatterns;
    const slugFormat = (settings as { slugFormat?: unknown }).slugFormat;
    const properties = rows
      .filter((r) => cards.has(r.propertyId))
      .slice(0, MAX_PROPERTIES)
      .map((r) => this.pageProperty(cards.get(r.propertyId)!, r, lang, labels, patterns, slugFormat));

    const from = this.formMail.sender(tenant);
    return {
      lang,
      labels,
      agency: {
        name: from.name,
        logo: settings.logoUrl && /^https:\/\//i.test(settings.logoUrl) ? settings.logoUrl : null,
        color: from.color,
        website: from.website ?? null,
      },
      buyer: { firstName: lead.firstName || null },
      agent: lead.assignedToUser ? { name: lead.assignedToUser.name || null, email: lead.assignedToUser.email || null, phone: null } : null,
      properties,
    };
  }

  async feedback(
    code: string,
    dto: { propertyId: number; action: FeedbackAction; reason?: string; message?: string },
    apiKey?: string,
  ): Promise<{ success: true; state: BuyerPageProperty['state'] }> {
    const { tenant, lead } = await this.resolve(code, apiKey);
    const row = await this.suggestions.findOne({ where: { tenantId: tenant.id, leadId: lead.id, propertyId: dto.propertyId, sentAt: Not(IsNull()) } });
    if (!row) throw new NotFoundException({ code: 'PROPERTY_NOT_FOUND', message: 'This property is not on your page' });
    const event = dto.action === 'like' ? 'liked' : dto.action === 'reject' ? 'rejected' : dto.action === 'clear' ? 'cleared' : 'viewing';
    const note = dto.action === 'reject' ? dto.reason : dto.action === 'viewing' ? dto.message : undefined;
    await this.tracking.record({ tenantId: tenant.id, leadId: lead.id, propertyIds: [row.propertyId], event, source: 'page', note });

    const card = (await this.matchService.cards(tenant.id, [row.propertyId])).get(row.propertyId);
    const reference = card?.reference ?? String(row.propertyId);
    const title = card ? titleOf(card.title, 'en') || reference : reference;
    if (dto.action === 'viewing') {
      await this.buyers.log(lead.id, null, 'viewing_request', dto.message?.trim() || null, { propertyId: row.propertyId, reference, title, source: 'page' }, true);
      this.pageMail
        .viewingRequest(tenant, lead, { reference, title, message: dto.message?.trim() || null })
        .catch((err) => this.logger.warn(`Viewing request notice for buyer ${lead.id} failed: ${(err as Error).message}`));
    } else {
      await this.buyers.log(lead.id, null, 'buyer_feedback', dto.action === 'reject' ? dto.reason?.trim() || null : null, {
        propertyId: row.propertyId, reference, title, action: dto.action, reason: dto.action === 'reject' ? dto.reason?.trim() || null : null, source: 'page',
      });
      await this.queueNotice(tenant.id, lead.id);
    }

    const fresh = await this.suggestions.findOne({ where: { id: row.id } });
    return { success: true, state: stateOf(fresh ?? row) };
  }

  // One batched notice per buyer per 10-minute window (BullMQ dedupes on the
  // job id, so both pm2 processes can add it).
  private async queueNotice(tenantId: number, leadId: number): Promise<void> {
    const job = feedbackNoticeJob(tenantId, leadId, Date.now());
    try {
      await this.queue.add(FEEDBACK_NOTICE_JOB, job.data, job.opts);
    } catch (err) {
      this.logger.warn(`Could not queue the feedback notice for buyer ${leadId}: ${(err as Error).message}`);
    }
  }

  private pageProperty(
    c: BuyerPropertyCard,
    s: LeadSuggestion,
    lang: string,
    labels: Record<string, string>,
    patterns: Record<string, string>,
    slugFormat: unknown,
  ): BuyerPageProperty & { slug: string | null } {
    const t = (k: string, f: string) => labels[k] || f;
    const facts = [
      c.bedrooms ? `${range(c.bedrooms, c.bedroomsTo)} ${t('buyer_email_beds', 'bed')}` : '',
      c.bathrooms ? `${range(c.bathrooms, c.bathroomsTo)} ${t('buyer_email_baths', 'bath')}` : '',
      c.buildSize ? `${range(c.buildSize, c.buildSizeTo)} m²` : '',
    ].filter(Boolean).join(' · ');
    const title = titleOf(c.title, lang) || c.reference;
    return {
      id: c.id,
      reference: c.reference,
      title,
      place: c.location ? titleOf(c.location.name, lang) : '',
      facts,
      price: priceText(c, lang, { onRequest: labels.price_on_request }),
      image: c.image && /^https?:\/\//i.test(c.image) ? c.image : null,
      url: propertyLink(c, lang, patterns, slugFormat),
      urlSegment: propertyUrlSegment(
        {
          reference: c.reference,
          title,
          slug: c.slug,
          location: c.location ? { name: titleOf(c.location.name, lang) } : null,
          propertyType: c.propertyType ? { name: titleOf(c.propertyType.name, lang) } : null,
        },
        slugFormat,
      ),
      slug: c.slug,
      state: stateOf(s),
    };
  }

  private async liveIds(tenantId: number, ids: number[]): Promise<number[]> {
    if (!ids.length) return [];
    const rows: { id: number }[] = await this.leads.manager.query(
      'SELECT id FROM properties WHERE tenantId = ? AND id IN (?) AND status = ? AND isPublished = 1',
      [tenantId, ids, 'active'],
    );
    return rows.map((r) => Number(r.id));
  }

  private langOf(lead: Pick<Lead, 'language'>, tenant: Tenant): string {
    const l = lead.language?.slice(0, 2).toLowerCase() || ((tenant.settings || {}) as TenantSettings).defaultLanguage || 'en';
    return /^[a-z]{2}$/.test(l) ? l : 'en';
  }

  private async tenant(id: number): Promise<Tenant> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) throw notFound();
    return tenant;
  }
}

function stateOf(s: LeadSuggestion): BuyerPageProperty['state'] {
  return { liked: !!s.likedAt, rejected: !!s.rejectedAt, rejectReason: s.rejectedAt ? s.rejectReason ?? null : null, viewing: !!s.viewingAt };
}

function range(from: number, to: number | null): string {
  return to && to > from ? `${from}–${to}` : String(from);
}
