import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Lead, Tenant } from '../../../../database/entities';
import { FormMailService, titleOf } from '../../form-mail.service';
import { priceText } from '../../../property/price-text';
import { BuyerService, assertNotErased } from '../buyer.service';
import type { BuyerViewer } from '../buyer-access';
import { BuyerSendService, buyerName, type SkippedProperty } from '../buyer-send.service';
import { BuyerSuggestionService } from '../buyer-suggestion.service';
import { BuyerMailService } from '../buyer-mail.service';
import { BuyerTaskService } from '../buyer-task.service';
import { BuyerTrackingService } from '../tracking/buyer-tracking.service';
import { BuyerPageService } from '../page/buyer-page.service';
import { BuyerViewingService } from '../viewings/buyer-viewing.service';
import { NewLeadService } from '../new-lead.service';
import { normalizeBuyerSettings } from '../buyer-settings.service';
import { fill, propertyLink } from '../buyer-mail';
import { dayLabel, mapLink } from '../viewings/itinerary';
import { localDayTime } from '../alerts/alert-rules';
import type { BuyerPropertyCard } from '../buyer-property-card';
import type { WhatsAppDto } from '../dto/buyer-whatsapp.dto';
import { buildWhatsAppText, cleanPhone, phonesOf, waUrl, type WhatsAppPhone, type WhatsAppPropertyLine } from './whatsapp-text';

// Where the lead is opened from: a contact in Buyer Match (add-on), or the
// New Leads inbox (every client; enquiry replies only).
export type WhatsAppScope = 'buyer' | 'newLead';

export interface WhatsAppPreview {
  phones: WhatsAppPhone[];
  lang: string;
  // The editable part: the agent's text, else the filled-in template.
  message: string;
  // The whole message as the buyer will read it (website links).
  text: string;
  skipped: SkippedProperty[];
  allSkipped: boolean;
  unsubscribed: boolean;
}

const TEMPLATE_KEYS = {
  properties: 'buyer_wa_properties',
  enquiry: 'buyer_wa_enquiry',
  viewing: 'buyer_wa_viewing',
  follow_up: 'buyer_wa_follow_up',
} as const;

// WhatsApp click-to-chat (2026-10-24): the message is put together here
// (property titles in the buyer's language, tracked links, the personal
// page) and the dashboard opens wa.me with it; the agent presses Send in
// their own WhatsApp. "Open" counts as sent: we can't see WhatsApp.
@Injectable()
export class BuyerWhatsAppService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly buyers: BuyerService,
    private readonly newLeads: NewLeadService,
    private readonly sender: BuyerSendService,
    private readonly suggestions: BuyerSuggestionService,
    private readonly mail: BuyerMailService,
    private readonly formMail: FormMailService,
    private readonly tracking: BuyerTrackingService,
    private readonly pages: BuyerPageService,
    private readonly viewings: BuyerViewingService,
    private readonly tasks: BuyerTaskService,
  ) {}

  async preview(tenantId: number, viewer: BuyerViewer, leadId: number, dto: WhatsAppDto, scope: WhatsAppScope): Promise<WhatsAppPreview> {
    const ctx = await this.context(tenantId, viewer, leadId, dto, scope, false);
    const links = new Map(ctx.properties.map((p) => [p.id, this.websiteLink(ctx.tenant, p, ctx.lang)]));
    const pageUrl = dto.kind === 'properties' ? await this.pages.linkFor(ctx.tenant, ctx.lead, ctx.lang) : null;
    return {
      phones: ctx.phones,
      lang: ctx.lang,
      message: ctx.message,
      text: this.text(ctx, (p) => links.get(p.id) ?? null, pageUrl),
      skipped: ctx.skipped,
      allSkipped: ctx.allSkipped,
      unsubscribed: !!ctx.lead.unsubscribedAt,
    };
  }

  async open(tenantId: number, viewer: BuyerViewer, leadId: number, dto: WhatsAppDto, scope: WhatsAppScope): Promise<{ url: string; text: string }> {
    const ctx = await this.context(tenantId, viewer, leadId, dto, scope, true);
    const phone = dto.phone ? cleanPhone(dto.phone) : ctx.phones[0] ?? null;
    if (!phone) throw new BadRequestException({ code: 'NO_PHONE', message: 'This person has no phone number for WhatsApp' });
    const { lead } = ctx;

    let text: string;
    if (dto.kind === 'properties') {
      const ids = ctx.properties.map((p) => p.id);
      const refs = ctx.properties.map((p) => p.reference);
      const send = await this.tracking.createSend({ tenantId, leadId: lead.id, recipient: 'buyer', kind: 'selection', channel: 'whatsapp', propertyIds: ids, lang: ctx.lang, userId: viewer.id });
      const tracked = this.tracking.trackingFor(send.id);
      // A listing with no page on the website gets no link (as in the email).
      text = this.text(ctx, (p) => (this.websiteLink(ctx.tenant, p, ctx.lang) ? tracked.link(p.id) : null), await this.pages.linkFor(ctx.tenant, lead, ctx.lang));
      await this.suggestions.markSent(tenantId, viewer.id, lead.id, ids);
      await this.tracking.record({ tenantId, leadId: lead.id, propertyIds: ids, event: 'sent', source: 'whatsapp', sendId: send.id, userId: viewer.id });
      await this.buyers.log(lead.id, viewer.id, 'suggestion_sent', refs.join(', '), {
        propertyIds: ids, references: refs, recipients: ['buyer'], lang: ctx.lang, sendId: send.id, channel: 'whatsapp',
      }, true);
    } else {
      text = this.text(ctx, () => null, null);
      await this.buyers.log(lead.id, viewer.id, 'whatsapp', ctx.message.slice(0, 500), {
        kind: dto.kind,
        ...(dto.viewingId ? { viewingId: dto.viewingId } : {}),
        ...(dto.taskId ? { taskId: dto.taskId } : {}),
        ...(ctx.properties[0] ? { reference: ctx.properties[0].reference } : {}),
      }, true);
      if (dto.kind === 'follow_up' && dto.taskId && dto.markTaskDone) await this.tasks.update(tenantId, viewer, dto.taskId, { done: true });
      if (dto.kind === 'enquiry' && scope === 'newLead' && dto.markHandled) await this.newLeads.setHandled(tenantId, viewer, lead.id, true);
    }
    return { url: waUrl(phone.digits, text), text };
  }

  // ── Building blocks ────────────────────────────────────────────────────

  private async context(tenantId: number, viewer: BuyerViewer, leadId: number, dto: WhatsAppDto, scope: WhatsAppScope, strict: boolean) {
    if (scope === 'newLead' && dto.kind !== 'enquiry') throw new BadRequestException('Only an enquiry reply can be sent from New Leads');
    if (scope === 'buyer' && dto.kind === 'enquiry') throw new BadRequestException('An enquiry reply is sent from New Leads');
    const lead: Lead = scope === 'newLead' ? await this.newLeads.findNew(tenantId, viewer, leadId) : await this.buyers.get(tenantId, viewer, leadId);
    assertNotErased(lead);
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const lang = this.sender.langOf(lead, tenant, dto.lang);
    const labels = await this.mail.labels(tenantId, lang);
    const settings = (tenant.settings || {}) as TenantSettings;
    const firstName = lead.firstName?.trim() || buyerName(lead)?.split(' ')[0] || null;

    let properties: BuyerPropertyCard[] = [];
    let skipped: SkippedProperty[] = [];
    let allSkipped = false;
    const vars: Record<string, string | number> = {};
    const extra: string[] = [];

    if (dto.kind === 'properties') {
      if (!dto.propertyIds?.length) throw new BadRequestException({ code: 'NO_PROPERTIES', message: 'Choose the properties first.' });
      ({ properties, skipped, allSkipped } = await this.sender.pickProperties(tenantId, lead.id, dto.propertyIds, dto.allowResend, strict));
      vars.count = properties.length;
    } else if (dto.kind === 'enquiry') {
      const form = await this.newLeads.latestForm(lead.id);
      const meta = (form?.metadata ?? {}) as { reference?: string | null; title?: string | null; pageUrl?: string | null; references?: string[] };
      vars.property = [meta.reference, meta.title].filter(Boolean).join(' · ') || (meta.references ?? []).join(', ') || tenant.name;
      if (typeof meta.pageUrl === 'string' && /^https?:\/\/\S+$/i.test(meta.pageUrl)) extra.push(meta.pageUrl);
    } else if (dto.kind === 'viewing') {
      if (!dto.viewingId) throw new BadRequestException('Choose the viewing first.');
      const [v] = await this.viewings.items(tenantId, [dto.viewingId]);
      if (!v || v.leadId !== lead.id) throw new NotFoundException('Viewing not found');
      const { day, time } = localDayTime(new Date(v.startsAt), settings.timezone || 'UTC');
      vars.date = dayLabel(day, lang);
      vars.time = time;
      vars.property = v.property ? titleOf(v.property.title, lang) || v.property.reference : v.title || '';
      if (v.property) {
        const link = this.websiteLink(tenant, v.property, lang);
        if (link) extra.push(link);
      }
      if (v.meetingPoint?.trim()) {
        extra.push(fill(labels.buyer_wa_meeting_point || 'Meeting point: {place}', { place: v.meetingPoint.trim() }));
        const map = mapLink(null, null, v.meetingPoint);
        if (map) extra.push(map);
      }
    } else if (dto.kind === 'follow_up') {
      if (dto.taskId) {
        const list = await this.tasks.listForBuyer(tenantId, viewer, lead.id);
        if (!list.some((t) => t.id === dto.taskId)) throw new NotFoundException('Task not found');
      }
    }

    const template = labels[TEMPLATE_KEYS[dto.kind]] || '';
    const message = dto.message?.trim() || greet(template, firstName, vars);
    const agent = lead.assignedToUser?.name?.trim() || null;
    const company = this.formMail.sender(tenant).name;
    return {
      lead,
      tenant,
      lang,
      labels,
      message,
      properties,
      skipped,
      allSkipped,
      extra,
      signature: [agent, company].filter(Boolean).join(' · '),
      phones: phonesOf({ mobile: lead.mobile, phone: lead.phone || lead.contact?.phone }),
    };
  }

  private text(
    ctx: Awaited<ReturnType<BuyerWhatsAppService['context']>>,
    linkOf: (p: BuyerPropertyCard) => string | null,
    pageUrl: string | null,
  ): string {
    const lines: WhatsAppPropertyLine[] = ctx.properties.map((p) => ({
      title: titleOf(p.title, ctx.lang) || p.reference,
      price: `${priceText(p, ctx.lang, { onRequest: ctx.labels.price_on_request })} · Ref. ${p.reference}`,
      link: linkOf(p),
    }));
    const extra = [...ctx.extra];
    if (pageUrl) extra.push(fill(ctx.labels.buyer_wa_page_line || 'All your selected properties: {link}', { link: pageUrl }));
    return buildWhatsAppText({ message: ctx.message, properties: lines, extraLines: extra, signature: ctx.signature });
  }

  private websiteLink(tenant: Tenant, p: BuyerPropertyCard, lang: string): string | null {
    const settings = (tenant.settings || {}) as TenantSettings;
    return propertyLink(p, lang, normalizeBuyerSettings(settings.buyerMatch).propertyUrlPatterns, (settings as { slugFormat?: unknown }).slugFormat);
  }
}

// The template with the first name; without a name "Hi {name}," reads "Hi,".
export function greet(template: string, firstName: string | null, vars: Record<string, string | number>): string {
  const t = firstName ? template : template.replace(/[ \t]*\{name\}/g, '');
  return fill(t, { ...vars, name: firstName ?? '' }).trim();
}
