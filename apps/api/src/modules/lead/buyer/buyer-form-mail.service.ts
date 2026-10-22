import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { BuyerWishlist, TenantSettings } from '@spm/shared';
import { Feature, Lead, Location, PropertyType, Tenant, User } from '../../../database/entities';
import { SystemMailerService } from '../../mail/system-mailer.service';
import { FormMailService, titleOf, validEmail } from '../form-mail.service';
import { BuyerMailService } from './buyer-mail.service';
import { BuyerQuestionService } from './buyer-question.service';
import { buildAgentNotice, buildWishlistConfirmation, wishlistSummary, type SummaryRow, type WishlistNames } from './buyer-form-mail';

const PREFERRED: Record<string, string> = { call: 'Phone call', email: 'Email', whatsapp: 'WhatsApp' };

// Sends the wishlist form's two emails. Fire-and-forget from the controller:
// a mail problem never fails the visitor's form.
@Injectable()
export class BuyerFormMailService {
  private readonly logger = new Logger(BuyerFormMailService.name);

  constructor(
    private readonly mailer: SystemMailerService,
    private readonly formMail: FormMailService,
    private readonly buyerMail: BuyerMailService,
    private readonly questions: BuyerQuestionService,
    private readonly config: ConfigService,
    @InjectRepository(Location) private readonly locations: Repository<Location>,
    @InjectRepository(PropertyType) private readonly types: Repository<PropertyType>,
    @InjectRepository(Feature) private readonly features: Repository<Feature>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async send(tenant: Tenant, lead: Lead, args: { email: string; isNew: boolean; notes?: string; pageLanguage: string }): Promise<void> {
    const from = this.formMail.sender(tenant);
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || args.email;
    const wishlist = lead.wishlist ?? null;

    // 1. The visitor, in the page's language.
    const lang = args.pageLanguage;
    const labels = await this.buyerMail.labels(tenant.id, lang);
    const confirmation = buildWishlistConfirmation({ from, labels, name, summary: wishlistSummary(wishlist, await this.names(tenant.id, wishlist, lang), labels, lang) });
    await this.deliver(args.email, confirmation, from.replyTo, from);

    // 2. The agent (else the agency's enquiry addresses), in English.
    const agent = lead.assignedTo ? await this.users.findOne({ where: { id: lead.assignedTo, tenantId: tenant.id }, select: ['id', 'email'] }) : null;
    const s = (tenant.settings || {}) as TenantSettings;
    const to = validEmail(agent?.email)
      ? [validEmail(agent?.email) as string]
      : ((s.inquiryNotificationEmails || []).map(validEmail).filter(Boolean) as string[]);
    if (!to.length) return;
    const enLabels = lang === 'en' ? labels : await this.buyerMail.labels(tenant.id, 'en');
    const dashboard = (this.config.get<string>('DASHBOARD_URL') || '').replace(/\/$/, '');
    const notice = buildAgentNotice({
      from,
      name,
      email: args.email,
      phone: lead.phone,
      preferredContact: lead.preferredContact ? PREFERRED[lead.preferredContact] : null,
      isNew: args.isNew,
      summary: wishlistSummary(wishlist, await this.names(tenant.id, wishlist, 'en'), enLabels, 'en'),
      answers: await this.answerRows(tenant.id, lead.answers),
      notes: args.notes,
      buyerUrl: dashboard ? `${dashboard}/dashboard/buyers/${lead.id}` : undefined,
    });
    for (const address of to) await this.deliver(address, notice, args.email, from);
  }

  private async names(tenantId: number, w: BuyerWishlist | null, lang: string): Promise<WishlistNames> {
    const pick = async <T extends { id: number; name: unknown }>(repo: Repository<T>, ids: number[] | undefined): Promise<Map<number, string>> => {
      if (!ids?.length) return new Map();
      const rows = await repo.find({ where: { tenantId, id: In(ids) } as never, select: ['id', 'name'] as never });
      return new Map(rows.map((r) => [r.id, titleOf(r.name, lang)]));
    };
    return {
      locations: await pick(this.locations, w?.locationIds),
      types: await pick(this.types, w?.propertyTypeIds),
      features: await pick(this.features, w?.featureIds),
    };
  }

  private async answerRows(tenantId: number, answers: Record<string, string[]> | null): Promise<SummaryRow[]> {
    if (!answers || !Object.keys(answers).length) return [];
    const rows: SummaryRow[] = [];
    for (const q of await this.questions.list(tenantId)) {
      const picked = answers[q.qkey];
      if (!picked?.length) continue;
      const value = picked.map((k) => titleOf(q.options.find((o) => o.key === k)?.label, 'en') || k).join(', ');
      rows.push({ label: titleOf(q.label, 'en'), value });
    }
    return rows;
  }

  private async deliver(
    to: string,
    mail: { subject: string; html: string; text: string },
    replyTo: string | undefined,
    from: ReturnType<FormMailService['sender']>,
  ): Promise<void> {
    const res = await this.mailer.send({ to, ...mail, replyTo, fromName: from.name, fromEmail: from.fromEmail });
    if (!res.delivered && res.skippedReason === 'error') this.logger.warn(`Wishlist form email to ${to} failed: ${res.error}`);
  }
}
