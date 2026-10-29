import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { PluginLicense } from '../../database/entities';
import { SystemMailerService } from '../mail/system-mailer.service';
import { PLUGIN_PRODUCT, generatePluginKey, pluginPlan } from './plugin-plans';

// Stripe events for plugin purchases (realtysoft.eu Payment Links). StripeWebhookService verifies the
// signature, dedupes and opens the transaction, then hands plugin events here: they carry
// metadata.spm_product=spm-ai-translator on the session (from the Payment Link) or on the
// subscription (Payment Link subscription_data.metadata) and its invoices.

export type PluginBillingOutcome = 'applied' | 'awaiting-payment' | 'payment-failed' | 'ignored' | 'stale';

const DAY = 86_400_000;

/** Whether a Stripe event object belongs to a plugin purchase. */
export function isPluginStripeObject(eventType: string, obj: any): boolean {
  const meta =
    eventType.startsWith('invoice.')
      ? obj?.parent?.subscription_details?.metadata ?? obj?.subscription_details?.metadata
      : obj?.metadata;
  return meta?.spm_product === PLUGIN_PRODUCT;
}

@Injectable()
export class PluginLicenseBillingService {
  private readonly logger = new Logger(PluginLicenseBillingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly mailer: SystemMailerService,
  ) {}

  private graceMs(): number {
    return Number(this.config.get<string>('STRIPE_GRACE_DAYS') ?? 7) * DAY;
  }

  async handle(manager: EntityManager, eventType: string, obj: any, created?: number): Promise<PluginBillingOutcome> {
    switch (eventType) {
      case 'checkout.session.completed':
        if (obj.payment_status === 'unpaid') return 'awaiting-payment'; // SEPA etc.: wait for async success.
        return this.checkoutPaid(manager, obj, created);
      case 'checkout.session.async_payment_succeeded':
        return this.checkoutPaid(manager, obj, created);
      case 'checkout.session.async_payment_failed':
        this.logger.warn(`plugin checkout ${obj.id} async payment failed: no licence issued`);
        return 'payment-failed';
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return this.subscriptionSync(manager, obj, created);
      case 'customer.subscription.deleted':
        return this.subscriptionEnded(manager, obj, created);
      case 'invoice.paid':
        return this.invoicePaid(manager, obj, created);
      case 'invoice.payment_failed':
        // Keep the licence until its paid period plus grace runs out; Stripe retries the payment.
        this.logger.warn(`plugin invoice ${obj.id} payment failed (subscription ${subscriptionIdOf(obj)})`);
        return 'payment-failed';
      default:
        return 'ignored';
    }
  }

  /** Paid checkout: create the licence (once) and email the key. */
  private async checkoutPaid(manager: EntityManager, session: any, created?: number): Promise<PluginBillingOutcome> {
    const repo = manager.getRepository(PluginLicense);
    const plan = pluginPlan(session.metadata?.spm_plan);
    const email = String(session.customer_details?.email ?? session.customer_email ?? '').trim().toLowerCase();
    if (!plan || !email) {
      this.logger.error(`plugin checkout ${session.id}: unknown plan "${session.metadata?.spm_plan}" or no email, no licence issued`);
      return 'ignored';
    }
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
    const existing = await repo.findOne({
      where: [{ stripeCheckoutSessionId: session.id }, ...(subscriptionId ? [{ stripeSubscriptionId: subscriptionId }] : [])],
    });
    if (existing) return 'applied'; // Already issued (subscription event may have arrived first; key already sent).

    const key = generatePluginKey();
    // Provisional period until the subscription/invoice event brings the exact end date.
    const months = plan.words ? 1 : 12;
    const expires = new Date();
    expires.setUTCMonth(expires.getUTCMonth() + months);
    const license = repo.create({
      product: PLUGIN_PRODUCT,
      keyHash: key.hash,
      last4: key.last4,
      plan: plan.id,
      sitesAllowed: plan.sites,
      wordsAllowed: plan.words,
      status: 'active',
      expiresAt: new Date(expires.getTime() + this.graceMs()),
      creditsPeriodStart: plan.words ? new Date(Math.floor(Date.now() / 1000) * 1000) : null,
      email,
      customerName: session.customer_details?.name ?? null,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null,
      stripeSubscriptionId: subscriptionId,
      stripeCheckoutSessionId: session.id,
      lastStripeEventAt: created ?? null,
    });
    await repo.save(license);
    // Fire after commit would be ideal; the key is only useful once the row exists, and a failed send
    // is logged so support can resend. The transaction is short, so send inline.
    await this.sendKeyEmail(license, key.rawKey, plan.label);
    this.logger.log(`plugin licence ${license.id} issued: plan=${plan.id} email=${email}`);
    return 'applied';
  }

  private async subscriptionSync(manager: EntityManager, sub: any, created?: number): Promise<PluginBillingOutcome> {
    const repo = manager.getRepository(PluginLicense);
    const license = await repo.findOne({ where: { stripeSubscriptionId: sub.id } });
    if (!license) return 'ignored'; // Checkout event creates the licence; it carries the email.
    if (isStale(license, created)) return 'stale';

    const periodEnd = periodEndOf(sub);
    const plan = pluginPlan(sub.metadata?.spm_plan);
    const patch: Partial<PluginLicense> = { lastStripeEventAt: created ?? license.lastStripeEventAt };
    if (plan && plan.id !== license.plan) {
      patch.plan = plan.id;
      patch.sitesAllowed = plan.sites;
      patch.wordsAllowed = plan.words;
    }
    if (['active', 'trialing', 'past_due'].includes(sub.status)) {
      patch.status = license.status === 'revoked' ? 'revoked' : 'active';
      if (periodEnd) patch.expiresAt = new Date(periodEnd * 1000 + this.graceMs());
    } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(sub.status)) {
      patch.status = license.status === 'revoked' ? 'revoked' : 'expired';
    }
    await repo.update(license.id, patch);
    return 'applied';
  }

  private async subscriptionEnded(manager: EntityManager, sub: any, created?: number): Promise<PluginBillingOutcome> {
    const repo = manager.getRepository(PluginLicense);
    const license = await repo.findOne({ where: { stripeSubscriptionId: sub.id } });
    if (!license) return 'ignored';
    if (isStale(license, created)) return 'stale';
    await repo.update(license.id, {
      status: license.status === 'revoked' ? 'revoked' : 'expired',
      expiresAt: new Date(),
      lastStripeEventAt: created ?? license.lastStripeEventAt,
    });
    return 'applied';
  }

  /** Renewal paid: extend the licence; credit plans start a new word period. */
  private async invoicePaid(manager: EntityManager, invoice: any, created?: number): Promise<PluginBillingOutcome> {
    const repo = manager.getRepository(PluginLicense);
    const subscriptionId = subscriptionIdOf(invoice);
    const license = subscriptionId ? await repo.findOne({ where: { stripeSubscriptionId: subscriptionId } }) : null;
    if (!license) return 'ignored';
    const line = invoice.lines?.data?.[0];
    const periodStart = Number(line?.period?.start ?? invoice.period_start ?? 0);
    const periodEnd = Number(line?.period?.end ?? invoice.period_end ?? 0);
    const patch: Partial<PluginLicense> = { lastStripeEventAt: Math.max(created ?? 0, license.lastStripeEventAt ?? 0) || null };
    if (license.status !== 'revoked') patch.status = 'active';
    if (periodEnd) patch.expiresAt = new Date(periodEnd * 1000 + this.graceMs());
    if (license.wordsAllowed && periodStart) patch.creditsPeriodStart = new Date(periodStart * 1000);
    await repo.update(license.id, patch);
    return 'applied';
  }

  private async sendKeyEmail(license: PluginLicense, rawKey: string, planLabel: string): Promise<void> {
    const download = this.config.get<string>('PLUGIN_DOWNLOAD_PAGE_URL') || 'https://realtysoft.eu/en/ai-translator-for-polylang/';
    const name = license.customerName ? ` ${license.customerName.split(' ')[0]}` : '';
    const sites = `${license.sitesAllowed} ${license.sitesAllowed === 1 ? 'site' : 'sites'}`;
    const text = [
      `Hi${name},`,
      '',
      `Thank you for buying SPM AI Translator for Polylang (${planLabel}, ${sites}).`,
      '',
      `Your licence key: ${rawKey}`,
      '',
      'To get started:',
      `1. Download the plugin: ${download}`,
      '2. In WordPress, go to Plugins → Add New → Upload Plugin, upload the zip and activate it.',
      '3. The setup wizard opens. Paste your licence key in the first step.',
      '',
      'Keep this email: the key is shown only here. Updates arrive in WordPress automatically while your licence is active.',
      '',
      'RealtySoft',
    ].join('\n');
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
    const html =
      `<p>Hi${esc(name)},</p><p>Thank you for buying <strong>SPM AI Translator for Polylang</strong> (${esc(planLabel)}, ${esc(sites)}).</p>` +
      `<p>Your licence key:</p><p style="font:600 20px/1.4 monospace;letter-spacing:1px;padding:12px 16px;background:#f3f6f4;border-radius:6px;display:inline-block">${esc(rawKey)}</p>` +
      `<ol><li><a href="${esc(download)}">Download the plugin</a>.</li><li>In WordPress, go to Plugins → Add New → Upload Plugin, upload the zip and activate it.</li><li>The setup wizard opens. Paste your licence key in the first step.</li></ol>` +
      '<p>Keep this email: the key is shown only here. Updates arrive in WordPress automatically while your licence is active.</p><p>RealtySoft</p>';
    const result = await this.mailer.send({ to: license.email, subject: 'Your SPM AI Translator licence key', text, html });
    if (!result.delivered) {
      this.logger.error(`plugin licence ${license.id}: key email NOT delivered to ${license.email} (${result.skippedReason ?? 'error'})`);
    }
  }
}

function subscriptionIdOf(invoice: any): string | null {
  const s = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription;
  return typeof s === 'string' ? s : s?.id ?? null;
}

/** Subscription period end (unix seconds); newer API versions keep it on the items. */
function periodEndOf(sub: any): number | null {
  const v = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return typeof v === 'number' ? v : null;
}

function isStale(license: PluginLicense, created?: number): boolean {
  return !!(created && license.lastStripeEventAt && created < license.lastStripeEventAt);
}
