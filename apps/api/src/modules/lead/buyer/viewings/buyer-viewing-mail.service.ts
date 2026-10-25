import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { BuyerViewing, Lead, Property, Tenant, User } from '../../../../database/entities';
import { escapeHtml } from '../../../../common/security/escape-html';
import { SystemMailerService } from '../../../mail/system-mailer.service';
import { BrochureService } from '../../../brochure/brochure.service';
import { priceText } from '../../../property/price-text';
import { FormMailService, frame, titleOf, validEmail } from '../../form-mail.service';
import { BuyerService } from '../buyer.service';
import type { BuyerViewer } from '../buyer-access';
import { BuyerMailService } from '../buyer-mail.service';
import { BuyerMatchService } from '../buyer-match.service';
import { fill } from '../buyer-mail';
import { localDayTime } from '../alerts/alert-rules';
import { BuyerViewingService } from './buyer-viewing.service';
import { buildIcs } from '../calendar/ics';
import { groupByDay, itineraryHtml, mapLink, type ItineraryViewing } from './itinerary';

// The buyer's itinerary PDF (and the email that carries it), and the agent's
// reminder before a viewing.

const t0 = (labels: Record<string, string>, key: string, fallback: string) => labels[key] || fallback;
@Injectable()
export class BuyerViewingMailService {
  private readonly logger = new Logger(BuyerViewingMailService.name);

  constructor(
    @InjectRepository(BuyerViewing) private readonly viewings: Repository<BuyerViewing>,
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly buyers: BuyerService,
    private readonly viewingService: BuyerViewingService,
    private readonly matchService: BuyerMatchService,
    private readonly buyerMail: BuyerMailService,
    private readonly formMail: FormMailService,
    private readonly brochures: BrochureService,
    private readonly mailer: SystemMailerService,
    private readonly config: ConfigService,
  ) {}

  async itinerary(tenantId: number, viewer: BuyerViewer, tripId: number, langParam?: string): Promise<{ pdf: Buffer; filename: string; lang: string; lead: Lead; ics: string }> {
    const trip = await this.viewingService.trip(tenantId, viewer, tripId);
    const lead = await this.buyers.get(tenantId, viewer, trip.leadId);
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Unknown tenant');
    const settings = (tenant.settings || {}) as TenantSettings;
    const lang = langParam && /^[a-z]{2}$/.test(langParam) ? langParam : lead.language?.slice(0, 2).toLowerCase() || settings.defaultLanguage || 'en';
    const labels = await this.buyerMail.labels(tenantId, lang);
    const rows = await this.viewings.find({ where: { tenantId, tripId: trip.id }, order: { startsAt: 'ASC' } });
    const live = rows.filter((r) => r.status !== 'cancelled');
    const ids = [...new Set(live.map((r) => r.propertyId).filter((x): x is number => !!x))];
    const cards = await this.matchService.cards(tenantId, ids);
    const coords = new Map(
      (ids.length ? await this.properties.find({ where: { tenantId, id: In(ids) }, select: ['id', 'lat', 'lng'] }) : []).map((p) => [p.id, p]),
    );
    const items: ItineraryViewing[] = live.map((r) => {
      const c = r.propertyId ? cards.get(r.propertyId) : undefined;
      const place = c?.location ? titleOf(c.location.name, lang) : '';
      const xy = r.propertyId ? coords.get(r.propertyId) : undefined;
      return {
        startsAt: new Date(r.startsAt),
        durationMin: r.durationMin,
        title: c ? titleOf(c.title, lang) || c.reference : r.title || '',
        reference: c?.reference ?? null,
        place,
        price: c ? priceText(c, lang, { onRequest: labels.price_on_request }) : '',
        image: c?.image ?? null,
        meetingPoint: r.meetingPoint,
        mapUrl: mapLink(xy?.lat ?? null, xy?.lng ?? null, place),
      };
    });
    const from = this.formMail.sender(tenant);
    const html = itineraryHtml({
      lang,
      labels,
      agency: { name: from.name, logo: settings.logoUrl ?? null, color: from.color, website: from.website ?? null },
      buyerName: [lead.firstName, lead.lastName].filter(Boolean).join(' ') || null,
      trip: { start: String(trip.startDate).slice(0, 10), end: String(trip.endDate).slice(0, 10), notes: trip.notes },
      agent: lead.assignedToUser ? { name: lead.assignedToUser.name, email: lead.assignedToUser.email } : null,
      days: groupByDay(items, settings.timezone || 'UTC', lang),
    });
    const pdf = await this.brochures.renderHtml(html);
    // The same viewings as a calendar file, so the buyer can add them in one tap.
    const ics = buildIcs({
      name: t0(labels, 'buyer_trip_title_anon', 'Your viewing itinerary'),
      events: live.map((r, i) => ({
        uid: `viewing-${r.id}@spm`,
        start: new Date(r.startsAt),
        durationMin: r.durationMin,
        title: `${from.name}: ${items[i].title || t0(labels, 'buyer_trip_title_anon', 'Viewing')}`,
        location: r.meetingPoint || items[i].place || null,
        description: [items[i].reference ? `Ref. ${items[i].reference}` : '', items[i].mapUrl ?? ''].filter(Boolean).join('\n') || null,
        updatedAt: r.updatedAt,
      })),
    });
    const slug = (lead.firstName || 'buyer').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'buyer';
    return { pdf, filename: `Itinerary-${slug}-${String(trip.startDate).slice(0, 10)}.pdf`, lang, lead, ics };
  }

  // Emails the itinerary PDF to the buyer, in their language.
  async sendItinerary(tenantId: number, viewer: BuyerViewer, tripId: number, langParam?: string): Promise<{ to: string }> {
    const { pdf, filename, lang, lead, ics } = await this.itinerary(tenantId, viewer, tripId, langParam);
    const to = validEmail(lead.contact?.email);
    if (!to || /@no-email\.invalid$/i.test(to)) throw new BadRequestException({ code: 'NO_RECIPIENT', message: 'The buyer has no email address' });
    const tenant = (await this.tenants.findOne({ where: { id: tenantId } }))!;
    const from = this.formMail.sender(tenant);
    const labels = await this.buyerMail.labels(tenantId, lang);
    const t = (k: string, f: string) => labels[k] || f;
    const name = lead.firstName || null;
    const greeting = name ? fill(t('buyer_email_greeting', 'Dear {name},'), { name }) : t('buyer_email_greeting_anon', 'Hello,');
    const body = t('buyer_trip_email_body', 'Attached is your viewing itinerary. We look forward to seeing you.');
    const subject = fill(t('buyer_trip_email_subject', '{company}: your viewing itinerary'), { company: from.name });
    const html = frame(from, t('buyer_trip_title_anon', 'Your viewing itinerary'), `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(body)}</p>`);
    const agentEmail = validEmail(lead.assignedToUser?.email);
    const res = await this.mailer.send({
      to,
      subject,
      html,
      text: `${greeting}\n\n${body}\n\n${from.name}`,
      replyTo: agentEmail || from.replyTo,
      fromName: from.name,
      fromEmail: from.fromEmail,
      attachments: [
        { filename, content: pdf, contentType: 'application/pdf' },
        { filename: 'viewings.ics', content: Buffer.from(ics, 'utf8'), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' },
      ],
    });
    if (!res.delivered && res.skippedReason !== 'no-transport') throw new BadRequestException({ code: 'EMAIL_FAILED', message: 'The email could not be sent' });
    await this.buyers.log(lead.id, viewer.id, 'email', `Itinerary sent (${filename})`, { kind: 'itinerary', tripId }, true);
    return { to };
  }

  // Reminders claimed by BuyerViewingService.claimReminders: one email to the
  // viewing's agent (else the buyer's agent). English, like the dashboard.
  async sendReminders(now = new Date()): Promise<number> {
    const due = await this.viewingService.claimReminders(now);
    let sent = 0;
    for (const v of due) {
      try {
        const lead = await this.leads.findOne({ where: { id: v.leadId }, relations: { contact: true } });
        const tenant = await this.tenants.findOne({ where: { id: v.tenantId } });
        const agentId = v.agentId ?? lead?.assignedTo ?? null;
        const agent = agentId ? await this.users.findOne({ where: { id: agentId, tenantId: v.tenantId } }) : null;
        const to = validEmail(agent?.email);
        if (!lead || !tenant || !to) continue;
        const card = v.propertyId ? (await this.matchService.cards(v.tenantId, [v.propertyId])).get(v.propertyId) : null;
        const what = card ? `${card.reference} — ${titleOf(card.title, 'en') || ''}`.replace(/ — $/, '') : v.title || 'a viewing';
        const settings = (tenant.settings || {}) as TenantSettings;
        const { time } = localDayTime(new Date(v.startsAt), settings.timezone || 'UTC');
        const buyer = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.contact?.email || 'the buyer';
        const phone = lead.mobile || lead.phone;
        const dashboard = (this.config.get<string>('DASHBOARD_URL') || '').replace(/\/$/, '');
        const from = this.formMail.sender(tenant);
        const lines = [
          `${time}: ${what} with ${buyer}${phone ? ` (${phone})` : ''}.`,
          ...(v.meetingPoint ? [`Meeting point: ${v.meetingPoint}`] : []),
        ];
        const url = dashboard ? `${dashboard}/dashboard/buyers/${lead.id}?tab=visit` : null;
        const res = await this.mailer.send({
          to,
          subject: `Viewing at ${time}: ${what}`,
          html: frame(from, 'Viewing reminder', `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}${url ? `<p><a href="${escapeHtml(url)}" style="color:${from.color};font-weight:600;">Open the buyer</a></p>` : ''}`),
          text: [...lines, ...(url ? ['', url] : [])].join('\n'),
          replyTo: from.replyTo,
          fromName: from.name,
          fromEmail: from.fromEmail,
        });
        if (res.delivered || res.skippedReason === 'no-transport') sent++;
      } catch (err) {
        this.logger.warn(`Viewing reminder ${v.id} failed: ${(err as Error).message}`);
      }
    }
    return sent;
  }
}
