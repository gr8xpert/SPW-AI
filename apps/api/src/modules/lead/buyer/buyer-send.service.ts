import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Lead, Tenant } from '../../../database/entities';
import { BrochureService } from '../../brochure/brochure.service';
import { BuyerService, assertNotErased } from './buyer.service';
import type { BuyerViewer } from './buyer-access';
import { BuyerMatchService } from './buyer-match.service';
import { BuyerSuggestionService, type HiddenReason } from './buyer-suggestion.service';
import { BuyerMailService, type BuyerMailArgs, type BuyerMailRecipient } from './buyer-mail.service';
import { BuyerTrackingService } from './tracking/buyer-tracking.service';
import { BuyerPageService } from './page/buyer-page.service';
import { fill, type BuyerMail } from './buyer-mail';
import type { BuyerPropertyCard } from './buyer-property-card';
import type { SendPropertiesDto } from './dto/buyer-match.dto';

const MAX_PDF = 30;

export interface SkippedProperty {
  propertyId: number;
  reference: string;
  reason: HiddenReason;
}

// Sending the agent's selection: by email (preview first), or as one PDF of
// the Suggested list.
@Injectable()
export class BuyerSendService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly buyers: BuyerService,
    private readonly matchService: BuyerMatchService,
    private readonly suggestions: BuyerSuggestionService,
    private readonly mail: BuyerMailService,
    private readonly brochures: BrochureService,
    private readonly tracking: BuyerTrackingService,
    private readonly pages: BuyerPageService,
  ) {}

  // The email as it will go out. Properties already sent or rejected are
  // left out (and listed in skipped) unless allowResend; when that leaves
  // nothing, the preview shows them anyway with allSkipped set.
  async preview(
    tenantId: number,
    viewer: BuyerViewer,
    id: number,
    dto: SendPropertiesDto,
  ): Promise<BuyerMail & { lang: string; to: BuyerMailRecipient[]; skipped: SkippedProperty[]; allSkipped: boolean }> {
    const { lead, args, recipients, skipped, allSkipped } = await this.prepare(tenantId, viewer, id, dto, false);
    const pageUrl = recipients.some((r) => r.kind === 'buyer') ? (await this.pages.linkFor(args.tenant, lead, args.lang)) ?? undefined : undefined;
    return { ...(await this.mail.compose({ ...args, pageUrl })), lang: args.lang, to: recipients, skipped, allSkipped };
  }

  async send(
    tenantId: number,
    viewer: BuyerViewer,
    id: number,
    dto: SendPropertiesDto,
  ): Promise<{ lang: string; results: { email: string; kind: string; ok: boolean }[]; skipped: SkippedProperty[] }> {
    const { lead, args, recipients, skipped } = await this.prepare(tenantId, viewer, id, dto, true);
    const { lang, results } = await this.deliver(tenantId, viewer.id, lead, args, recipients, 'selection');
    return { lang, results, skipped };
  }

  // Sends the email to each recipient, then records it: send rows (their
  // ids sign the buyer's tracking links), the Suggested list, the timeline
  // and one activity. Used by Send, reverse match and alerts.
  async deliver(
    tenantId: number,
    userId: number | null,
    lead: Lead,
    args: BuyerMailArgs,
    recipients: BuyerMailRecipient[],
    kind: 'selection' | 'alert',
  ): Promise<{ lang: string; results: { email: string; kind: string; ok: boolean }[]; sendId: number | null }> {
    const ids = args.properties.map((p) => p.id);
    // The buyer's copy carries their personal page link (made on first send).
    if (recipients.some((r) => r.kind === 'buyer') && !args.pageUrl) {
      args = { ...args, pageUrl: (await this.pages.linkFor(args.tenant, lead, args.lang)) ?? undefined };
    }
    const results = await this.mail.send(args, recipients, {
      open: async (r) => {
        const row = await this.tracking.createSend({ tenantId, leadId: lead.id, recipient: r.kind, kind, propertyIds: ids, lang: args.lang, userId });
        return { sendId: row.id, tracking: r.kind === 'buyer' ? this.tracking.trackingFor(row.id, lead.id) : undefined };
      },
      failed: (sendId) => this.tracking.dropSend(sendId),
    });
    const sent = results.filter((r) => r.ok);
    if (!sent.length) throw new BadGatewayException({ code: 'EMAIL_FAILED', message: 'The email could not be sent' });

    const sendId = (sent.find((r) => r.kind === 'buyer') ?? sent[0]).sendId ?? null;
    await this.suggestions.markSent(tenantId, userId, lead.id, ids);
    await this.tracking.record({ tenantId, leadId: lead.id, propertyIds: ids, event: 'sent', source: kind === 'alert' ? 'alert' : 'email', sendId, userId });
    await this.buyers.log(
      lead.id,
      userId,
      kind === 'alert' ? 'alert_sent' : 'suggestion_sent',
      args.properties.map((p) => p.reference).join(', '),
      { propertyIds: ids, references: args.properties.map((p) => p.reference), recipients: sent.map((r) => r.kind), lang: args.lang, sendId },
      sent.some((r) => r.kind === 'buyer'),
    );
    return { lang: args.lang, results: results.map(({ email, kind: k, ok }) => ({ email, kind: k, ok })), sendId };
  }

  // An alert email (milestone H) with the listings the agent approved for
  // this buyer. No viewer: the agent already approved it (or the daily
  // digest runs it). Listings no longer live are left out; price drops show
  // their old price. Recipients follow the buyer's "send matches to".
  async sendAlert(
    tenantId: number,
    userId: number | null,
    leadId: number,
    items: { propertyId: number; oldPrice: number | null }[],
  ): Promise<{ sendId: number | null; propertyIds: number[] }> {
    const lead = await this.buyers.get(tenantId, { id: userId ?? 0, role: 'admin' }, leadId);
    const tenant = await this.tenant(tenantId);
    const ids = [...new Set(items.map((i) => i.propertyId))];
    const live = await this.suggestions.liveListings(tenantId, ids);
    const cards = await this.matchService.cards(tenantId, live.map((p) => p.id));
    const properties = ids.map((pid) => cards.get(pid)).filter((c): c is BuyerPropertyCard => !!c);
    if (!properties.length) return { sendId: null, propertyIds: [] };

    const to = lead.wishlist?.sendMatchesTo ?? 'buyer';
    const recipients: BuyerMailRecipient[] = [];
    for (const kind of (to === 'both' ? ['buyer', 'agent'] : [to]) as ('buyer' | 'agent')[]) {
      // An unsubscribed or erased buyer gets no alerts (their agent still can).
      if (kind === 'buyer' && (lead.unsubscribedAt || lead.erasedAt)) continue;
      const email = kind === 'buyer' ? lead.contact?.email : lead.assignedToUser?.email;
      if (email && !recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) recipients.push({ kind, email });
    }
    if (!recipients.length && (lead.unsubscribedAt || lead.erasedAt)) return { sendId: null, propertyIds: [] };
    if (!recipients.length) throw new BadRequestException({ code: 'NO_RECIPIENT', message: 'Nobody to send this alert to' });

    const drops: Record<number, number> = {};
    for (const i of items) if (i.oldPrice) drops[i.propertyId] = i.oldPrice;
    const args: BuyerMailArgs = {
      tenant,
      lang: this.langOf(lead, tenant),
      buyerName: buyerName(lead),
      agent: lead.assignedToUser ? { name: lead.assignedToUser.name, email: lead.assignedToUser.email } : null,
      properties,
      alert: { drops },
    };
    const { sendId } = await this.deliver(tenantId, userId, lead, args, recipients, 'alert');
    return { sendId, propertyIds: properties.map((p) => p.id) };
  }

  // One PDF: agency cover with the buyer's name, then each suggested
  // property (or only `ids` among them).
  async pdf(tenantId: number, viewer: BuyerViewer, id: number, langParam?: string, onlyIds?: number[]): Promise<{ pdf: Buffer; filename: string }> {
    const lead = await this.buyers.get(tenantId, viewer, id);
    const tenant = await this.tenant(tenantId);
    const list = await this.suggestions.list(tenantId, viewer, lead.id);
    const picked = list.filter((s) => s.property && (!onlyIds?.length || onlyIds.includes(s.propertyId)));
    if (!picked.length) throw new BadRequestException({ code: 'NO_SUGGESTIONS', message: 'There are no suggested properties to print' });
    const lang = this.langOf(lead, tenant, langParam);
    const labels = await this.mail.labels(tenantId, lang);
    const name = buyerName(lead) || lead.contact?.email || '';
    const agent = lead.assignedToUser?.name || null;
    const ids = picked.slice(0, MAX_PDF).map((s) => s.propertyId);
    const date = new Date();
    const { pdf } = await this.brochures.renderSelection({
      tenantId,
      propertyIds: ids,
      lang,
      cover: {
        title: fill(labels.buyer_pdf_cover_title || 'Selected properties for {name}', { name }),
        preparedBy: agent ? fill(labels.buyer_pdf_prepared_by || 'Prepared by {agent}', { agent }) : null,
        count: fill(labels.buyer_pdf_properties || '{n} properties', { n: ids.length }),
        date: formatDate(date, lang),
      },
    });
    const slug = (name || 'buyer').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'buyer';
    return { pdf, filename: `Selection-${slug}-${date.toISOString().slice(0, 10)}.pdf` };
  }

  // The live listings to send, in the order picked. Already sent or
  // rejected ones are left out (listed in skipped) unless allowResend; when
  // that leaves nothing, strict refuses and a preview shows them all.
  // Shared by email and WhatsApp.
  async pickProperties(
    tenantId: number,
    leadId: number,
    propertyIds: number[],
    allowResend: boolean | undefined,
    strict: boolean,
  ): Promise<{ properties: BuyerPropertyCard[]; skipped: SkippedProperty[]; allSkipped: boolean }> {
    const wanted = [...new Set(propertyIds)];
    const live = await this.suggestions.liveListings(tenantId, wanted);
    const cards = await this.matchService.cards(tenantId, live.map((p) => p.id));
    const all = wanted.map((pid) => cards.get(pid)).filter((c): c is BuyerPropertyCard => !!c);
    if (!all.length) throw new BadRequestException({ code: 'NO_PROPERTIES', message: 'None of these properties is on the website' });

    // Never send twice, unless the agent says so.
    const hidden = allowResend ? new Map<number, HiddenReason>() : await this.suggestions.hiddenIds(tenantId, leadId);
    const skipped: SkippedProperty[] = all
      .filter((p) => hidden.has(p.id))
      .map((p) => ({ propertyId: p.id, reference: p.reference, reason: hidden.get(p.id)! }));
    let properties = all.filter((p) => !hidden.has(p.id));
    const allSkipped = !properties.length;
    if (allSkipped) {
      if (strict) {
        throw new BadRequestException({
          code: 'ALL_ALREADY_SENT',
          details: { skipped },
          message: 'Every one of these properties was already sent to this buyer or rejected',
        });
      }
      properties = all;
    }
    return { properties, skipped, allSkipped };
  }

  private async prepare(tenantId: number, viewer: BuyerViewer, id: number, dto: SendPropertiesDto, strict: boolean) {
    const lead = await this.buyers.get(tenantId, viewer, id);
    assertNotErased(lead);
    const tenant = await this.tenant(tenantId);
    const { properties, skipped, allSkipped } = await this.pickProperties(tenantId, lead.id, dto.propertyIds, dto.allowResend, strict);

    const recipients: BuyerMailRecipient[] = [];
    for (const kind of [...new Set(dto.recipients)]) {
      // Unsubscribed: the buyer's copy is left out; alone it is refused.
      if (kind === 'buyer' && lead.unsubscribedAt) {
        if (strict && dto.recipients.every((k) => k === 'buyer')) {
          throw new BadRequestException({ code: 'UNSUBSCRIBED', message: 'This buyer unsubscribed from property emails' });
        }
        continue;
      }
      const email = kind === 'buyer' ? lead.contact?.email : lead.assignedToUser?.email;
      if (!email) {
        if (strict) throw new BadRequestException({ code: 'NO_RECIPIENT', details: { recipient: kind }, message: `The ${kind} has no email address` });
        continue;
      }
      if (!recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) recipients.push({ kind, email });
    }

    const args: BuyerMailArgs = {
      tenant,
      lang: this.langOf(lead, tenant, dto.lang),
      buyerName: buyerName(lead),
      agent: lead.assignedToUser ? { name: lead.assignedToUser.name, email: lead.assignedToUser.email } : null,
      properties,
      message: dto.message,
    };
    return { lead, args, recipients, skipped, allSkipped };
  }

  langOf(lead: Pick<Lead, 'language'>, tenant: Tenant, asked?: string): string {
    const settings = (tenant.settings || {}) as TenantSettings;
    const lang = asked || lead.language?.slice(0, 2).toLowerCase() || settings.defaultLanguage || 'en';
    return /^[a-z]{2}$/.test(lang) ? lang : 'en';
  }

  private async tenant(tenantId: number): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }
}

export function buyerName(lead: Pick<Lead, 'firstName' | 'lastName'>): string | null {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || null;
}

function formatDate(d: Date, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}
