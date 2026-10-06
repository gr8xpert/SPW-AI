import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { TenantSettings } from '@spm/shared';
import { Property, SiteCheckin, Tenant } from '../../database/entities';
import { SystemMailerService } from '../mail/system-mailer.service';
import { escapeHtml } from '../../common/security/escape-html';
import type { InquiryDto, ShareFavoritesDto } from './dto';

// Emails from the forms on a client's website (property inquiry, wishlist).
// They go out through the platform's SMTP account (SMTP2GO) — deliverability —
// but nothing in them names the platform: the sender name is the client's
// company, replies go to the client, links go to the client's site. The
// address itself is the client's own only once their domain is verified in
// SMTP2GO (Super Admin flag `ownEmailDomain`); until then it is SMTP_FROM.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface FormSender {
  /** Company name shown as the sender and in the emails. */
  name: string;
  /** Sender address; undefined = the platform's SMTP_FROM. */
  fromEmail?: string;
  /** Where a visitor's reply goes. */
  replyTo?: string;
  /** The client's website, for the footer. */
  website?: string;
  color: string;
}

interface ShareCard {
  title: string;
  reference: string;
  price: string;
  facts: string;
  image?: string;
  url?: string;
}

@Injectable()
export class FormMailService {
  private readonly logger = new Logger(FormMailService.name);

  constructor(
    private readonly mailer: SystemMailerService,
    @InjectRepository(Property) private readonly properties: Repository<Property>,
    @InjectRepository(SiteCheckin) private readonly checkins: Repository<SiteCheckin>,
  ) {}

  sender(tenant: Tenant): FormSender {
    const s = (tenant.settings || {}) as TenantSettings;
    const own = validEmail(s.formSenderEmail);
    const contact = own || (s.inquiryNotificationEmails || []).map(validEmail).find(Boolean) || validEmail(s.contactEmail);
    const website = s.websiteUrl?.trim() || (tenant.domain ? `https://${tenant.domain}` : undefined);
    return {
      name: (s.companyName || tenant.name || '').trim() || 'Our team',
      fromEmail: own && tenant.featureFlags?.ownEmailDomain === true ? own : undefined,
      replyTo: contact || undefined,
      website: website && /^https?:\/\//i.test(website) ? website : undefined,
      color: /^#[0-9a-f]{3,8}$/i.test(s.primaryColor || '') ? (s.primaryColor as string) : '#2563eb',
    };
  }

  /** A property the inquiry or share may name: this client's own, else none. */
  async ownProperty(tenantId: number, id: number | undefined): Promise<Property | null> {
    if (!id) return null;
    return this.properties.findOne({ where: { id, tenantId }, select: ['id', 'reference', 'title'] });
  }

  async inquiry(tenant: Tenant, dto: InquiryDto, leadId: number, property: Property | null, origin?: string): Promise<void> {
    const s = (tenant.settings || {}) as TenantSettings;
    const from = this.sender(tenant);
    const name = dto.name?.trim() || 'A visitor';
    const phone = dto.phone?.trim() || 'Not provided';
    const message = dto.message?.trim() || '(No message)';
    const pageUrl = await this.ownSiteUrl(tenant, dto.pageUrl, origin);
    const propertyLine = property ? `${property.reference} — ${titleOf(property.title)}` : '';

    // 1. To the agency. Reply goes straight to the visitor.
    const recipients = (s.inquiryNotificationEmails || []).map(validEmail).filter(Boolean) as string[];
    if (recipients.length) {
      const html = frame(from, 'New Property Inquiry', `
        <p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(dto.email)})</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        ${propertyLine ? `<p><strong>Property:</strong> ${escapeHtml(propertyLine)}</p>` : ''}
        ${pageUrl ? `<p><strong>Page:</strong> <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a></p>` : ''}
        ${quote(message)}
        <p style="color:#64748b;font-size:12px;">Lead #${leadId}. Reply to this email to answer ${escapeHtml(name)} directly.</p>`);
      const text = [
        `New inquiry from ${name} (${dto.email})`,
        `Phone: ${phone}`,
        ...(propertyLine ? [`Property: ${propertyLine}`] : []),
        ...(pageUrl ? [`Page: ${pageUrl}`] : []),
        '',
        message,
      ].join('\n');
      for (const to of recipients) {
        void this.send({ to, subject: `New inquiry from ${name}${property ? ` — ${property.reference}` : ''}`, html, text, replyTo: dto.email, from });
      }
    }

    // 2. Confirmation to the visitor, from the client.
    if (s.inquiryAutoReplyEnabled !== false) {
      const html = frame(from, from.name, `
        <p>Hi ${escapeHtml(name)},</p>
        <p>Thank you for your inquiry. We have received your message and our team will get back to you shortly.</p>
        ${propertyLine ? `<p><strong>Property:</strong> ${escapeHtml(propertyLine)}</p>` : ''}
        ${quote(message, 'Your message:')}
        <p style="color:#64748b;font-size:13px;">Best regards,<br/>${escapeHtml(from.name)}</p>`);
      const text = `Hi ${name},\n\nThank you for your inquiry. We have received your message and our team will get back to you shortly.\n\n${propertyLine ? `Property: ${propertyLine}\n\n` : ''}Your message:\n${message}\n\nBest regards,\n${from.name}${from.website ? `\n${from.website}` : ''}`;
      void this.send({ to: dto.email, subject: `We received your inquiry — ${from.name}`, html, text, replyTo: from.replyTo, from });
    }
  }

  /**
   * The wishlist, emailed to whoever the visitor named. Returns the
   * references shared (for the lead) — empty when none of the ids is a live
   * listing of this client.
   */
  async wishlist(tenant: Tenant, dto: ShareFavoritesDto, origin: string | undefined, language: string): Promise<string[]> {
    const from = this.sender(tenant);
    const ids = [...new Set(dto.items.map((i) => i.id))];
    const rows = await this.properties.find({
      where: { tenantId: tenant.id, id: In(ids), status: 'active', isPublished: true },
      select: ['id', 'reference', 'title', 'price', 'priceOnRequest', 'currency', 'listingType', 'bedrooms', 'bathrooms', 'images'],
    });
    if (!rows.length) return [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const site = await this.siteOrigin(tenant, origin);
    const cards: ShareCard[] = [];
    for (const item of dto.items) {
      const p = byId.get(item.id);
      if (!p || cards.some((c) => c.reference === p.reference)) continue;
      const path = item.path && /^\/(?!\/)[^\s\\]*$/.test(item.path) ? item.path : undefined;
      cards.push({
        title: titleOf(p.title, language),
        reference: p.reference,
        price: priceOf(p, language),
        facts: [p.bedrooms ? `${p.bedrooms} bed` : '', p.bathrooms ? `${p.bathrooms} bath` : ''].filter(Boolean).join(' · '),
        image: firstImage(p),
        url: site && path ? `${site}${path}` : undefined,
      });
    }

    const who = dto.senderName?.trim() || dto.senderEmail || 'Someone';
    const subject = `${who} shared ${cards.length === 1 ? 'a property' : `${cards.length} properties`} with you — ${from.name}`;
    const list = cards.map((c) => `
      <tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          ${c.image ? `<td width="140" valign="top" style="padding-right:14px;"><img src="${escapeHtml(c.image)}" width="140" alt="" style="display:block;width:140px;height:auto;border-radius:6px;"/></td>` : ''}
          <td valign="top">
            <p style="margin:0 0 4px;font-weight:600;">${escapeHtml(c.title)}</p>
            <p style="margin:0 0 4px;color:#64748b;font-size:13px;">Ref. ${escapeHtml(c.reference)}${c.facts ? ` · ${escapeHtml(c.facts)}` : ''}</p>
            <p style="margin:0 0 8px;font-weight:600;">${escapeHtml(c.price)}</p>
            ${c.url ? `<a href="${escapeHtml(c.url)}" style="color:${from.color};">View property</a>` : ''}
          </td>
        </tr></table>
      </td></tr>`).join('');
    const html = frame(from, from.name, `
      <p>${escapeHtml(who)} thought you'd like ${cards.length === 1 ? 'this property' : 'these properties'}.</p>
      ${dto.message?.trim() ? quote(dto.message.trim()) : ''}
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${list}</table>`);
    const text = `${who} thought you'd like ${cards.length === 1 ? 'this property' : 'these properties'}.\n\n${dto.message?.trim() ? `${dto.message.trim()}\n\n` : ''}${cards
      .map((c) => `${c.title}\nRef. ${c.reference}${c.facts ? ` · ${c.facts}` : ''}\n${c.price}${c.url ? `\n${c.url}` : ''}`)
      .join('\n\n')}\n\n${from.name}${from.website ? `\n${from.website}` : ''}`;
    // A reply goes to the friend who shared it when they gave their email.
    void this.send({ to: dto.recipientEmail, subject, html, text, replyTo: dto.senderEmail || from.replyTo, from });

    // The agency hears about it when the visitor left their email (a lead).
    const s = (tenant.settings || {}) as TenantSettings;
    const recipients = (s.inquiryNotificationEmails || []).map(validEmail).filter(Boolean) as string[];
    if (dto.senderEmail && recipients.length) {
      const refs = cards.map((c) => c.reference).join(', ');
      const agencyHtml = frame(from, 'Wishlist shared', `
        <p><strong>${escapeHtml(who)}</strong> (${escapeHtml(dto.senderEmail)}) emailed their wishlist to ${escapeHtml(dto.recipientEmail)}.</p>
        <p><strong>Properties:</strong> ${escapeHtml(refs)}</p>
        ${dto.message?.trim() ? quote(dto.message.trim()) : ''}
        <p style="color:#64748b;font-size:12px;">Reply to this email to contact ${escapeHtml(who)} directly.</p>`);
      const agencyText = `${who} (${dto.senderEmail}) emailed their wishlist to ${dto.recipientEmail}.\nProperties: ${refs}${dto.message?.trim() ? `\n\n${dto.message.trim()}` : ''}`;
      for (const to of recipients) {
        void this.send({ to, subject: `Wishlist shared by ${who}`, html: agencyHtml, text: agencyText, replyTo: dto.senderEmail, from });
      }
    }
    return cards.map((c) => c.reference);
  }

  private async send(m: { to: string; subject: string; html: string; text: string; replyTo?: string; from: FormSender }): Promise<void> {
    const result = await this.mailer.send({
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text,
      replyTo: m.replyTo,
      fromName: m.from.name,
      fromEmail: m.from.fromEmail,
    });
    if (!result.delivered && result.skippedReason === 'error') {
      this.logger.warn(`Form email to ${m.to} failed: ${result.error}`);
    }
  }

  /**
   * The client's site to link to: the page the form was sent from when that
   * is one of the client's own sites (staging or live), else their website
   * setting. A forged Origin can't turn the email into a link to anywhere else.
   */
  private async siteOrigin(tenant: Tenant, origin?: string): Promise<string | undefined> {
    const own = await this.ownHosts(tenant);
    const o = originOf(origin);
    if (o && own.has(bareHost(new URL(o).host))) return o;
    return originOf(this.sender(tenant).website);
  }

  private async ownSiteUrl(tenant: Tenant, url: string | undefined, origin?: string): Promise<string | undefined> {
    const site = await this.siteOrigin(tenant, origin);
    if (!url || !site) return undefined;
    try {
      const u = new URL(url);
      return bareHost(u.host) === bareHost(new URL(site).host) && /^https?:$/.test(u.protocol) ? u.href : undefined;
    } catch {
      return undefined;
    }
  }

  private async ownHosts(tenant: Tenant): Promise<Set<string>> {
    const hosts = new Set<string>();
    const add = (u: string | null | undefined) => {
      const o = originOf(u);
      if (o) hosts.add(bareHost(new URL(o).host));
    };
    add(this.sender(tenant).website);
    if (tenant.domain) add(`https://${tenant.domain}`);
    const sites = await this.checkins.find({ where: { tenantId: tenant.id }, select: ['siteUrl'], take: 50 });
    sites.forEach((c) => add(c.siteUrl));
    return hosts;
  }
}

function validEmail(v: unknown): string | null {
  return typeof v === 'string' && EMAIL_RE.test(v.trim()) ? v.trim().toLowerCase() : null;
}

function originOf(u: string | null | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function titleOf(title: unknown, language = 'en'): string {
  if (typeof title === 'string') return title;
  const t = (title || {}) as Record<string, string>;
  return t[language] || t.en || Object.values(t).find(Boolean) || '';
}

function priceOf(p: Property, language: string): string {
  const price = Number(p.price ?? 0);
  if (p.priceOnRequest || !price) return 'Price on request';
  try {
    const amount = new Intl.NumberFormat(language || 'en', { style: 'currency', currency: p.currency || 'EUR', maximumFractionDigits: 0 }).format(price);
    return p.listingType === 'rent' ? `${amount} / month` : p.listingType === 'holiday_rent' ? `${amount} / night` : amount;
  } catch {
    return `${price.toLocaleString('en')} ${p.currency || ''}`.trim();
  }
}

function firstImage(p: Property): string | undefined {
  const img = [...(p.images || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  return img?.url && /^https:\/\//i.test(img.url) ? img.url : undefined;
}

function quote(message: string, label?: string): string {
  return `<div style="background:#f8fafc;border-radius:6px;padding:16px;margin:16px 0;">
    ${label ? `<p style="margin:0 0 8px;color:#64748b;font-size:13px;">${escapeHtml(label)}</p>` : ''}
    <p style="margin:0;white-space:pre-wrap;">${escapeHtml(message)}</p>
  </div>`;
}

function frame(from: FormSender, heading: string, body: string): string {
  const site = from.website
    ? `<p style="margin:0;"><a href="${escapeHtml(from.website)}" style="color:#64748b;">${escapeHtml(from.website.replace(/^https?:\/\//i, '').replace(/\/$/, ''))}</a></p>`
    : '';
  return `
    <div style="background:#f1f5f9;padding:16px 8px;">
    <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">
      <div style="background:${from.color};padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="color:#ffffff;margin:0;">${escapeHtml(heading)}</h2>
      </div>
      <div style="background:#ffffff;color:#0f172a;border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        ${body}
      </div>
      <div style="padding:12px 4px;color:#64748b;font-size:12px;text-align:center;">
        <p style="margin:0 0 2px;">${escapeHtml(from.name)}</p>
        ${site}
      </div>
    </div>
    </div>`;
}
