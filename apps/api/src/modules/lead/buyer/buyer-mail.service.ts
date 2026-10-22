import { Injectable, Logger } from '@nestjs/common';
import type { Tenant } from '../../../database/entities';
import type { TenantSettings } from '@spm/shared';
import { SystemMailerService } from '../../mail/system-mailer.service';
import { LabelService } from '../../label/label.service';
import { DEFAULT_LABELS } from '../../label/default-labels';
import { TranslationMemoryService, memoryKey } from '../../translation-memory/translation-memory.service';
import { FormMailService, validEmail } from '../form-mail.service';
import { normalizeBuyerSettings } from './buyer-settings.service';
import { buildBuyerEmail, type BuyerMail, type BuyerMailInput } from './buyer-mail';
import type { BuyerPropertyCard } from './buyer-property-card';

// Buyer Match email: the agent's selection, sent to the buyer (and/or the
// agent) in the buyer's language. Like FormMailService: the client's
// branding, the platform's SMTP account, the platform never named.

// Labels these emails use whose missing languages come from translation memory.
const MEMORY_PREFIXES = ['buyer_', 'wishlist_form_', 'listing_type_'];
const BUYER_DEFAULTS = DEFAULT_LABELS.filter((l) => MEMORY_PREFIXES.some((p) => l.key.startsWith(p)));

export interface BuyerMailRecipient {
  kind: 'buyer' | 'agent';
  email: string;
}

export interface BuyerMailArgs {
  tenant: Tenant;
  lang: string;
  buyerName: string | null;
  agent: { name: string | null; email: string | null } | null;
  properties: BuyerPropertyCard[];
  message?: string;
  // The buyer's personal page link (milestone F); only the buyer's copy shows it.
  pageUrl?: string;
  // Alert wording + old prices of price drops (milestone H).
  alert?: { drops: Record<number, number> };
}

export interface BuyerMailHooks {
  open?: (r: BuyerMailRecipient) => Promise<{ sendId: number; tracking?: BuyerMailInput['tracking'] }>;
  failed?: (sendId: number) => Promise<void>;
}

@Injectable()
export class BuyerMailService {
  private readonly logger = new Logger(BuyerMailService.name);

  constructor(
    private readonly mailer: SystemMailerService,
    private readonly formMail: FormMailService,
    private readonly labelService: LabelService,
    private readonly translationMemory: TranslationMemoryService,
  ) {}

  // The client's labels in this language. A buyer_* / wishlist_form_* default with no text in
  // the language (and none typed by the client) comes from translation
  // memory, else stays English.
  async labels(tenantId: number, lang: string): Promise<Record<string, string>> {
    const labels = await this.labelService.getLabelsForWidget(tenantId, lang);
    const gaps = BUYER_DEFAULTS.filter((dl) => !dl.translations[lang] && labels[dl.key] === dl.translations.en);
    if (lang === 'en' || !gaps.length) return labels;
    try {
      const memory = await this.translationMemory.lookup('label', gaps.map((dl) => dl.translations.en));
      for (const dl of gaps) {
        const text = memory.get(memoryKey(dl.translations.en) || '')?.[lang];
        if (text) labels[dl.key] = text;
      }
    } catch (err) {
      this.logger.warn(`Translation memory lookup failed: ${(err as Error).message}`);
    }
    return labels;
  }

  async compose(args: BuyerMailArgs, copyFor?: string, tracking?: BuyerMailInput['tracking']): Promise<BuyerMail> {
    const settings = (args.tenant.settings || {}) as TenantSettings;
    const from = this.formMail.sender(args.tenant);
    return buildBuyerEmail({
      from,
      labels: await this.labels(args.tenant.id, args.lang),
      lang: args.lang,
      buyerName: args.buyerName,
      agent: args.agent,
      message: args.message,
      properties: args.properties,
      urlPatterns: normalizeBuyerSettings(settings.buyerMatch).propertyUrlPatterns,
      slugFormat: (settings as { slugFormat?: unknown }).slugFormat,
      copyFor,
      tracking,
      pageUrl: copyFor ? undefined : args.pageUrl,
      alert: args.alert,
    });
  }

  // Sends one email per recipient. A reply goes to the agent when they have
  // an email, else to the agency. ok = delivered, or logged in dev (no SMTP).
  // hooks.open runs before each email is built (it makes the send row whose
  // id signs the tracking links); hooks.failed undoes it.
  async send(
    args: BuyerMailArgs,
    recipients: BuyerMailRecipient[],
    hooks: BuyerMailHooks = {},
  ): Promise<{ email: string; kind: string; ok: boolean; error?: string; sendId?: number }[]> {
    const from = this.formMail.sender(args.tenant);
    const replyTo = validEmail(args.agent?.email) || from.replyTo;
    const results: { email: string; kind: string; ok: boolean; error?: string; sendId?: number }[] = [];
    for (const r of recipients) {
      const opened = hooks.open ? await hooks.open(r) : undefined;
      const mail = await this.compose(args, r.kind === 'agent' ? args.buyerName || undefined : undefined, opened?.tracking);
      const res = await this.mailer.send({
        to: r.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo,
        fromName: from.name,
        fromEmail: from.fromEmail,
      });
      const ok = res.delivered || res.skippedReason === 'no-transport';
      if (!ok) {
        this.logger.warn(`Buyer email to ${r.email} failed: ${res.error}`);
        if (opened && hooks.failed) await hooks.failed(opened.sendId);
      }
      results.push({ email: r.email, kind: r.kind, ok, error: ok ? undefined : res.error, sendId: ok ? opened?.sendId : undefined });
    }
    return results;
  }
}
