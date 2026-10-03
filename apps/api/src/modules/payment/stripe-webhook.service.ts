import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { BillingCycle, SubscriptionStatus } from '@spm/shared';
import {
  CreditTransaction,
  ProcessedStripeEvent,
  SubscriptionPayment,
  Tenant,
} from '../../database/entities';
import { verifyStripeSignature } from './stripe-signature';
import { XeroSyncService } from '../xero-sync/xero-sync.service';
import { lockCreditBalance } from '../credit/credit-balance-lock';

export interface StripeProcessResult {
  processed: boolean;
  eventId: string;
  eventType: string;
  // 'stale': an older event arrived after a newer one was applied; any payment
  // row is still recorded, but the subscription state is left alone.
  outcome: 'applied' | 'replay' | 'ignored' | 'no-tenant' | 'awaiting-payment' | 'payment-failed' | 'stale';
  tenantId?: number;
}

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ProcessedStripeEvent)
    private readonly processedRepo: Repository<ProcessedStripeEvent>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(SubscriptionPayment)
    private readonly paymentRepo: Repository<SubscriptionPayment>,
    private readonly dataSource: DataSource,
    private readonly xeroSyncService: XeroSyncService,
  ) {}

  async process(options: {
    rawBody: string;
    signatureHeader: string | undefined;
  }): Promise<StripeProcessResult> {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set — rejecting event');
      throw new UnauthorizedException('Stripe webhooks not configured');
    }

    const verification = verifyStripeSignature({
      header: options.signatureHeader,
      rawBody: options.rawBody,
      secret,
    });
    if (!verification.ok) {
      this.logger.warn(`Stripe signature verification failed: ${verification.reason}`);
      throw new UnauthorizedException(
        `Invalid Stripe signature (${verification.reason})`,
      );
    }

    let event: any;
    try {
      event = JSON.parse(options.rawBody);
    } catch {
      this.logger.error('Stripe webhook body is not valid JSON');
      throw new UnauthorizedException('Invalid payload');
    }

    const eventId: string = event.id;
    const eventType: string = event.type;
    if (!eventId || !eventType) {
      this.logger.warn('Stripe event missing id or type');
      return { processed: false, eventId: eventId || '', eventType: eventType || '', outcome: 'ignored' };
    }

    const alreadySeen = await this.processedRepo.findOne({ where: { eventId } });
    if (alreadySeen) {
      return { processed: true, eventId, eventType, outcome: 'replay' };
    }

    if (!HANDLED_EVENTS.has(eventType)) {
      await this.recordProcessed(eventId, eventType);
      return { processed: true, eventId, eventType, outcome: 'ignored' };
    }

    // Unix seconds the event was created at Stripe — how out-of-order
    // deliveries are put back in order (see isStale).
    const created = typeof event.created === 'number' ? event.created : undefined;

    return await this.dataSource.transaction(async (manager) => {
      await manager.insert(ProcessedStripeEvent, { eventId, eventType });
      const obj = event.data?.object;
      if (!obj) {
        return { processed: true, eventId, eventType, outcome: 'ignored' as const };
      }

      switch (eventType) {
        case 'checkout.session.completed':
          // Delayed methods (SEPA, bank transfer) complete checkout before the
          // money arrives: Stripe sends payment_status 'unpaid' here, then
          // async_payment_succeeded or async_payment_failed later. Grant
          // nothing until it is paid.
          if (obj.payment_status === 'unpaid') {
            this.logger.log(
              `checkout ${obj.id} completed but unpaid (tenant=${obj.metadata?.tenantId}) — waiting for async payment`,
            );
            return { processed: true, eventId, eventType, outcome: 'awaiting-payment' as const };
          }
          return await this.handleCheckoutCompleted(manager, obj, eventId, eventType, created);
        case 'checkout.session.async_payment_succeeded':
          return await this.handleCheckoutCompleted(manager, obj, eventId, eventType, created);
        case 'checkout.session.async_payment_failed':
          // Nothing was granted on the unpaid completion, so nothing to undo.
          this.logger.warn(
            `checkout ${obj.id} async payment FAILED (tenant=${obj.metadata?.tenantId}, hours=${obj.metadata?.hours ?? '-'}, plan=${obj.metadata?.planId ?? '-'}) — nothing granted`,
          );
          return { processed: true, eventId, eventType, outcome: 'payment-failed' as const };
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          return await this.handleSubscriptionSync(manager, obj, eventId, eventType, created);
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionDeleted(manager, obj, eventId, eventType, created);
        case 'invoice.paid':
          return await this.handleInvoicePaid(manager, obj, eventId, eventType, created);
        case 'invoice.payment_failed':
          return await this.handleInvoiceFailed(manager, obj, eventId, eventType, created);
        default:
          return { processed: true, eventId, eventType, outcome: 'ignored' as const };
      }
    });
  }

  private async recordProcessed(eventId: string, eventType: string): Promise<void> {
    try {
      await this.processedRepo.insert({ eventId, eventType });
    } catch {
      // Duplicate insert lost the race — safe to ignore.
    }
  }

  // checkout.session.completed fires for both subscription mode (plan upgrades)
  // and payment mode (credit-package purchases). Branch on session.mode, with
  // metadata-based fallback: a session that has metadata.hours is a credit
  // purchase even if mode is absent (test fixtures may omit it).
  private async handleCheckoutCompleted(
    manager: EntityManager,
    session: any,
    eventId: string,
    eventType: string,
    created: number | undefined,
  ): Promise<StripeProcessResult> {
    const isCreditFlow =
      session.mode === 'payment' ||
      (!session.mode && session.metadata?.hours != null);
    const isSubscriptionFlow =
      session.mode === 'subscription' ||
      (!session.mode && session.metadata?.planId != null && session.metadata?.hours == null);

    if (isCreditFlow) {
      // Credits flow (one-time purchase)
      const tenantId = parseInt(session.metadata?.tenantId, 10);
      const hours = parseFloat(session.metadata?.hours);
      const paymentIntent = session.payment_intent ?? session.id;

      if (!tenantId || isNaN(hours) || hours <= 0) {
        this.logger.warn(
          `checkout.session.completed (payment) missing metadata — tenantId=${session.metadata?.tenantId}, hours=${session.metadata?.hours}`,
        );
        return { processed: true, eventId, eventType, outcome: 'no-tenant' };
      }

      const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
      if (!tenant) {
        this.logger.warn(
          `checkout.session.completed (payment) for unknown tenant ${tenantId}`,
        );
        return { processed: true, eventId, eventType, outcome: 'no-tenant' };
      }

      // Event-id dedup can't catch two different events for one payment
      // (e.g. completed + async_payment_succeeded), so check the payment too.
      const alreadyCredited = await manager.findOne(CreditTransaction, {
        where: { tenantId, type: 'purchase', paymentReference: paymentIntent },
      });
      if (alreadyCredited) {
        this.logger.warn(`Stripe payment ${paymentIntent} already credited to tenant ${tenantId} — skipping`);
        return { processed: true, eventId, eventType, outcome: 'replay' };
      }

      // Locked so a concurrent admin adjustment or ticket booking can't
      // overwrite this purchase (see credit-balance-lock).
      const balance = await lockCreditBalance(manager, tenantId, { create: true });
      if (!balance) {
        throw new Error(`credit balance row missing for tenant ${tenantId} after create`);
      }
      const newBalance = Number(balance.balance) + hours;
      balance.balance = newBalance;
      await manager.save(balance);

      await manager.insert(CreditTransaction, {
        tenantId,
        type: 'purchase',
        amount: hours,
        balanceAfter: newBalance,
        paymentReference: paymentIntent,
        description: `Purchased ${hours} credit hours via Stripe`,
        createdBy: null,
      });

      this.logger.log(`Credited ${hours}h to tenant ${tenantId} (Stripe ${paymentIntent})`);

      // Fire-and-forget Xero invoice sync via n8n. Never blocks credit
      // delivery — if n8n is down the log row stays 'pending' and the
      // XeroSyncCron picks it up on the next tick.
      const amountEur = (session.amount_total ?? 0) / 100;
      const currency = (session.currency ?? 'eur').toUpperCase();
      const stripeSessionId = typeof session.id === 'string' ? session.id : null;
      void this.xeroSyncService
        .enqueueCreditPurchaseInvoice({
          tenantId,
          stripeSessionId,
          hours,
          amountEur,
          currency,
        })
        .catch((err: Error) => {
          this.logger.warn(
            `Xero sync enqueue failed (tenant=${tenantId} session=${stripeSessionId}): ${err.message}`,
          );
        });

      return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
    }

    if (isSubscriptionFlow) {
      // Plan subscription flow — record initial payment, sync handled by
      // customer.subscription.created which fires alongside this event.
      const tenantId = parseInt(session.metadata?.tenantId, 10);
      const planId = parseInt(session.metadata?.planId, 10);
      const billingCycle = (session.metadata?.billingCycle as BillingCycle) ?? 'monthly';
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
      const customerId = typeof session.customer === 'string' ? session.customer : null;

      if (!tenantId || !planId) {
        this.logger.warn(
          `checkout.session.completed (subscription) missing metadata — tenantId=${session.metadata?.tenantId}, planId=${session.metadata?.planId}`,
        );
        return { processed: true, eventId, eventType, outcome: 'no-tenant' };
      }

      const amount = (session.amount_total ?? 0) / 100;
      const currency = (session.currency ?? 'eur').toUpperCase();

      await manager.insert(SubscriptionPayment, {
        tenantId,
        planId,
        type: 'new',
        amount,
        currency,
        billingCycle,
        stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        status: 'completed',
        paidAt: new Date(),
        stripeWebhookData: session,
      });

      const tenant = await this.lockTenant(manager, tenantId);
      if (tenant && isStale(tenant, created)) {
        this.logger.warn(
          `checkout ${session.id} (created ${created}) is older than the last subscription event applied to tenant ${tenantId} — payment recorded, plan left alone`,
        );
        return { processed: true, eventId, eventType, outcome: 'stale', tenantId };
      }
      if (tenant) {
        tenant.planId = planId;
        tenant.billingCycle = billingCycle;
        tenant.billingSource = 'stripe';
        tenant.subscriptionStatus = 'active';
        tenant.graceEndsAt = null;
        await manager.save(tenant);
      }

      return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
    }

    return { processed: true, eventId, eventType, outcome: 'ignored' };
  }

  private async handleSubscriptionSync(
    manager: EntityManager,
    sub: any,
    eventId: string,
    eventType: string,
    created: number | undefined,
  ): Promise<StripeProcessResult> {
    const tenantId = await this.resolveTenantFromSubscription(manager, sub);
    if (!tenantId) {
      return { processed: true, eventId, eventType, outcome: 'no-tenant' };
    }

    const tenant = await this.lockTenant(manager, tenantId);
    if (!tenant) return { processed: true, eventId, eventType, outcome: 'no-tenant' };
    if (isStale(tenant, created, { terminalWinsTie: true })) {
      this.logger.warn(
        `${eventType} ${eventId} for ${sub.id} (created ${created}) is older than the last applied (${tenant.lastStripeEventAt}) — skipped`,
      );
      return { processed: true, eventId, eventType, outcome: 'stale', tenantId };
    }

    const status = mapStripeSubStatus(sub.status);
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
    const cycle = mapInterval(interval);
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
    const planId = parseInt(sub.metadata?.planId, 10);

    tenant.billingSource = 'stripe';
    if (cycle) tenant.billingCycle = cycle;
    if (status) tenant.subscriptionStatus = status;
    if (periodEnd) tenant.expiresAt = periodEnd;
    if (status === 'active') tenant.graceEndsAt = null;
    if (Number.isInteger(planId) && planId > 0) tenant.planId = planId;
    // Only an event that sets the status moves the mark. One that doesn't
    // ('incomplete' on a new subscription) must not make an 'expired' left by
    // an earlier deletion look as if it were from this second.
    if (status) markApplied(tenant, created);
    await manager.save(tenant);

    return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
  }

  private async handleSubscriptionDeleted(
    manager: EntityManager,
    sub: any,
    eventId: string,
    eventType: string,
    created: number | undefined,
  ): Promise<StripeProcessResult> {
    const tenantId = await this.resolveTenantFromSubscription(manager, sub);
    if (!tenantId) return { processed: true, eventId, eventType, outcome: 'no-tenant' };

    const tenant = await this.lockTenant(manager, tenantId);
    if (!tenant) return { processed: true, eventId, eventType, outcome: 'no-tenant' };
    // Strictly older only: a deletion from the same second as the last applied
    // event still wins, as nothing follows it for this subscription. An older
    // one is a previous subscription ending after a newer one has started.
    if (isStale(tenant, created)) {
      this.logger.warn(
        `${eventType} ${eventId} for ${sub.id} (created ${created}) is older than the last applied (${tenant.lastStripeEventAt}) — skipped`,
      );
      return { processed: true, eventId, eventType, outcome: 'stale', tenantId };
    }

    tenant.subscriptionStatus = 'expired';
    if (sub.canceled_at) tenant.expiresAt = new Date(sub.canceled_at * 1000);
    markApplied(tenant, created);
    await manager.save(tenant);
    return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
  }

  private async handleInvoicePaid(
    manager: EntityManager,
    invoice: any,
    eventId: string,
    eventType: string,
    created: number | undefined,
  ): Promise<StripeProcessResult> {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
    if (!subscriptionId) return { processed: true, eventId, eventType, outcome: 'ignored' };

    const existing = await manager.findOne(SubscriptionPayment, {
      where: { stripeSubscriptionId: subscriptionId },
      order: { createdAt: 'DESC' },
    });
    const tenantId = existing?.tenantId ?? null;
    if (!tenantId) return { processed: true, eventId, eventType, outcome: 'no-tenant' };

    const tenant = await this.lockTenant(manager, tenantId);
    const amount = (invoice.amount_paid ?? 0) / 100;
    const currency = (invoice.currency ?? 'eur').toUpperCase();

    await manager.insert(SubscriptionPayment, {
      tenantId,
      planId: tenant?.planId ?? existing?.planId ?? 0,
      type: 'renewal',
      amount,
      currency,
      billingCycle: tenant?.billingCycle ?? 'monthly',
      stripePaymentIntentId: typeof invoice.payment_intent === 'string' ? invoice.payment_intent : null,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : null,
      status: 'completed',
      paidAt: new Date(),
      stripeWebhookData: invoice,
    });

    // The money is recorded either way; whether it changes the tenant's state
    // is another matter. Not when it's older than the subscription state we
    // have, and never out of 'expired': a canceled Stripe subscription can't
    // come back (a late invoice for it mustn't reopen access), and a live one
    // that recovers also sends customer.subscription.updated, which does.
    if (tenant && (isStale(tenant, created) || tenant.subscriptionStatus === 'expired')) {
      this.logger.warn(
        `invoice.paid ${eventId} for ${subscriptionId}: payment recorded, tenant ${tenantId} left ${tenant.subscriptionStatus} (created ${created}, last applied ${tenant.lastStripeEventAt})`,
      );
      return { processed: true, eventId, eventType, outcome: 'stale', tenantId };
    }

    if (tenant) {
      tenant.subscriptionStatus = 'active';
      tenant.graceEndsAt = null;
      tenant.billingSource = 'stripe';
      await manager.save(tenant);
    }

    return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
  }

  private async handleInvoiceFailed(
    manager: EntityManager,
    invoice: any,
    eventId: string,
    eventType: string,
    created: number | undefined,
  ): Promise<StripeProcessResult> {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
    if (!subscriptionId) return { processed: true, eventId, eventType, outcome: 'ignored' };

    const existing = await manager.findOne(SubscriptionPayment, {
      where: { stripeSubscriptionId: subscriptionId },
      order: { createdAt: 'DESC' },
    });
    const tenantId = existing?.tenantId ?? null;
    if (!tenantId) return { processed: true, eventId, eventType, outcome: 'no-tenant' };

    const tenant = await this.lockTenant(manager, tenantId);
    const amount = (invoice.amount_due ?? 0) / 100;
    const currency = (invoice.currency ?? 'eur').toUpperCase();
    const failure = invoice.last_finalization_error?.message ?? 'payment_failed';

    await manager.insert(SubscriptionPayment, {
      tenantId,
      planId: tenant?.planId ?? existing?.planId ?? 0,
      type: 'renewal',
      amount,
      currency,
      billingCycle: tenant?.billingCycle ?? 'monthly',
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : null,
      status: 'failed',
      failureReason: String(failure).slice(0, 500),
      stripeWebhookData: invoice,
    });

    // Same rule as invoice.paid: an old failure doesn't undo a newer state,
    // and an expired tenant isn't handed a fresh grace period.
    if (tenant && (isStale(tenant, created) || tenant.subscriptionStatus === 'expired')) {
      this.logger.warn(
        `invoice.payment_failed ${eventId} for ${subscriptionId}: recorded, tenant ${tenantId} left ${tenant.subscriptionStatus} (created ${created}, last applied ${tenant.lastStripeEventAt})`,
      );
      return { processed: true, eventId, eventType, outcome: 'stale', tenantId };
    }

    if (tenant) {
      tenant.subscriptionStatus = 'grace';
      const graceDays = Number(this.config.get<string>('STRIPE_GRACE_DAYS') ?? 7);
      tenant.graceEndsAt = new Date(Date.now() + graceDays * 24 * 3600 * 1000);
      await manager.save(tenant);
    }

    return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
  }

  // Row-locked for the rest of the transaction, so two webhooks for the same
  // tenant apply one after the other and the second sees the first's
  // lastStripeEventAt instead of both passing the age check.
  private lockTenant(manager: EntityManager, tenantId: number): Promise<Tenant | null> {
    return manager.findOne(Tenant, { where: { id: tenantId }, lock: { mode: 'pessimistic_write' } });
  }

  private async resolveTenantFromSubscription(
    manager: EntityManager,
    sub: any,
  ): Promise<number | null> {
    const fromMeta = parseInt(sub.metadata?.tenantId, 10);
    if (Number.isInteger(fromMeta) && fromMeta > 0) return fromMeta;

    const subId = typeof sub.id === 'string' ? sub.id : null;
    if (subId) {
      const existing = await manager.findOne(SubscriptionPayment, {
        where: { stripeSubscriptionId: subId },
        order: { createdAt: 'DESC' },
      });
      if (existing) return existing.tenantId;
    }
    return null;
  }
}

// Stripe doesn't deliver events in order, so a late
// customer.subscription.updated (status active) could land after
// customer.subscription.deleted and reopen a canceled account. Each tenant
// remembers the `created` time of the newest customer.subscription.* event
// that set its status (tenants.lastStripeEventAt) and anything older is stale.
// Comparing timestamps is Stripe's own suggestion, and needs no API call
// inside the transaction (re-fetching the subscription would).
//
// Only subscription events move that mark: they carry the whole subscription
// state. Invoices and checkouts are checked against it but don't move it, so
// a renewal's subscription.updated (new period end) delivered after its
// invoice.paid isn't thrown away.
//
// `created` has one-second resolution. With terminalWinsTie, an event from
// the same second as the last applied one is stale if that left the tenant
// 'expired' (canceled/deleted) — Stripe never revives a canceled subscription,
// so the terminal state must win, e.g. over an "updated" sent alongside it.
// Events without `created` (never from Stripe; some test fixtures) skip the check.
function isStale(
  tenant: Tenant,
  created: number | undefined,
  opts: { terminalWinsTie?: boolean } = {},
): boolean {
  if (created === undefined || tenant.lastStripeEventAt == null) return false;
  const last = Number(tenant.lastStripeEventAt);
  if (created < last) return true;
  return Boolean(opts.terminalWinsTie) && created === last && tenant.subscriptionStatus === 'expired';
}

function markApplied(tenant: Tenant, created: number | undefined): void {
  if (created === undefined) return;
  if (tenant.lastStripeEventAt == null || created > Number(tenant.lastStripeEventAt)) {
    tenant.lastStripeEventAt = created;
  }
}

function mapStripeSubStatus(status: string | undefined): SubscriptionStatus | null {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'grace';
    case 'canceled':
    case 'incomplete_expired':
      return 'expired';
    default:
      return null;
  }
}

function mapInterval(interval: string | undefined): BillingCycle | null {
  if (interval === 'month') return 'monthly';
  if (interval === 'year') return 'yearly';
  return null;
}
