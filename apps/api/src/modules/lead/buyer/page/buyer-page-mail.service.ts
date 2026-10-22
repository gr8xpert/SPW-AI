import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Lead, LeadActivity, Tenant, User } from '../../../../database/entities';
import { escapeHtml } from '../../../../common/security/escape-html';
import { SystemMailerService } from '../../../mail/system-mailer.service';
import { FormMailService, frame, quote, validEmail } from '../../form-mail.service';
import { noticeLines, type FeedbackItem } from './buyer-page-notice';

// Emails to the agent about what the buyer did on their page. English (the
// dashboard's language); sent to the buyer's agent, else the agency's
// enquiry addresses.
@Injectable()
export class BuyerPageMailService {
  private readonly logger = new Logger(BuyerPageMailService.name);

  constructor(
    @InjectRepository(Lead) private readonly leads: Repository<Lead>,
    @InjectRepository(LeadActivity) private readonly activities: Repository<LeadActivity>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly mailer: SystemMailerService,
    private readonly formMail: FormMailService,
    private readonly config: ConfigService,
  ) {}

  async viewingRequest(tenant: Tenant, lead: Lead, p: { reference: string; title: string; message: string | null }): Promise<void> {
    const name = buyerName(lead);
    const subject = `Viewing request from ${name}: ${p.reference}`;
    const lines = [`${name} asked to view ${p.title} (${p.reference}) on their personal page.`];
    await this.deliver(tenant, lead, subject, 'Viewing request', lines, p.message);
  }

  // The batched notice: every like / reject / take-back in the window.
  async feedbackNotice(tenantId: number, leadId: number, from: Date, until: Date): Promise<number> {
    const lead = await this.leads.findOne({ where: { id: leadId, tenantId }, relations: { contact: true } });
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!lead || !tenant) return 0;
    const rows = await this.activities.find({
      where: { leadId, type: 'buyer_feedback', createdAt: Between(from, new Date(until.getTime() - 1)) },
      order: { id: 'ASC' },
    });
    const items: FeedbackItem[] = rows
      .filter((r) => r.metadata && ['like', 'reject', 'clear'].includes(r.metadata.action))
      .map((r) => ({
        propertyId: Number(r.metadata!.propertyId),
        reference: String(r.metadata!.reference ?? ''),
        title: String(r.metadata!.title ?? ''),
        action: r.metadata!.action,
        reason: r.metadata!.reason ?? null,
        at: new Date(r.createdAt),
      }));
    const lines = noticeLines(items);
    if (!lines.length) return 0;
    const name = buyerName(lead);
    await this.deliver(tenant, lead, `${name} reacted to ${lines.length} ${lines.length === 1 ? 'property' : 'properties'}`, 'Buyer feedback', [
      `${name} gave feedback on their personal page:`,
      ...lines,
    ]);
    return lines.length;
  }

  private async deliver(tenant: Tenant, lead: Lead, subject: string, heading: string, lines: string[], message?: string | null): Promise<void> {
    const from = this.formMail.sender(tenant);
    const agent = lead.assignedTo ? await this.users.findOne({ where: { id: lead.assignedTo, tenantId: tenant.id }, select: ['id', 'email'] }) : null;
    const s = (tenant.settings || {}) as TenantSettings;
    const to = validEmail(agent?.email)
      ? [validEmail(agent?.email) as string]
      : ((s.inquiryNotificationEmails || []).map(validEmail).filter(Boolean) as string[]);
    if (!to.length) return;
    const dashboard = (this.config.get<string>('DASHBOARD_URL') || '').replace(/\/$/, '');
    const url = dashboard ? `${dashboard}/dashboard/buyers/${lead.id}?tab=suggested` : null;
    const [first, ...rest] = lines;
    const html = frame(
      from,
      heading,
      `<p>${escapeHtml(first)}</p>${rest.length ? `<ul>${rest.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : ''}${message ? quote(message) : ''}${
        url ? `<p><a href="${escapeHtml(url)}" style="color:${from.color};font-weight:600;">Open the buyer in the dashboard</a></p>` : ''
      }`,
    );
    const text = [...lines, ...(message ? ['', message] : []), ...(url ? ['', url] : [])].join('\n');
    const replyTo = validEmail(lead.contact?.email) || from.replyTo;
    for (const address of to) {
      const res = await this.mailer.send({ to: address, subject, html, text, replyTo, fromName: from.name, fromEmail: from.fromEmail });
      if (!res.delivered && res.skippedReason !== 'no-transport') this.logger.warn(`Buyer page notice to ${address} failed: ${res.error}`);
    }
  }
}

function buyerName(lead: Pick<Lead, 'firstName' | 'lastName' | 'contact'>): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.contact?.email || 'A buyer';
}
