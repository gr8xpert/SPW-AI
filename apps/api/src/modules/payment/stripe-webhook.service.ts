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
  CreditBalance,
  CreditTransaction,
  ProcessedStripeEvent,
  SubscriptionPayment,
  Tenant,
} from '../../database/entities';
import { verifyStripeSignature } from './stripe-signature';

export interface StripeProcessResult {
  processed: boolean;
  eventId: string;
  eventType: string;
  outcome: 'applied' | 'replay' | 'ignored' | 'no-tenant';
  tenantId?: number;
}

const HANDLED_EVENTS = new Set([
  'checkout.session.completed',
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

    return await this.dataSource.transaction(async (manager) => {
      await manager.insert(ProcessedStripeEvent, { eventId, eventType });
      const obj = event.data?.object;
      if (!obj) {
        return { processed: true, eventId, eventType, outcome: 'ignored' as const };
      }

      switch (eventType) {
        case 'checkout.session.completed':
          return await this.handleCheckoutCompleted(manager, obj, eventId, eventType);
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          return await this.handleSubscriptionSync(manager, obj, eventId, eventType);
        case 'customer.subscription.deleted':
          return await this.handleSubscriptionDeleted(manager, obj, eventId, eventType);
        case 'invoice.paid':
          return await this.handleInvoicePaid(manager, obj, eventId, eventType);
        case 'invoice.payment_failed':
          return await this.handleInvoiceFailed(manager, obj, eventId, eventType);
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

      let balance = await manager.findOne(CreditBalance, { where: { tenantId } });
      if (!balance) {
        balance = manager.create(CreditBalance, { tenantId, balance: 0 });
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

      const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
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
  ): Promise<StripeProcessResult> {
    const tenantId = await this.resolveTenantFromSubscription(manager, sub);
    if (!tenantId) {
      return { processed: true, eventId, eventType, outcome: 'no-tenant' };
    }

    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    if (!tenant) return { processed: true, eventId, eventType, outcome: 'no-tenant' };

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
    await manager.save(tenant);

    return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
  }

  private async handleSubscriptionDeleted(
    manager: EntityManager,
    sub: any,
    eventId: string,
    eventType: string,
  ): Promise<StripeProcessResult> {
    const tenantId = await this.resolveTenantFromSubscription(manager, sub);
    if (!tenantId) return { processed: true, eventId, eventType, outcome: 'no-tenant' };

    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    if (!tenant) return { processed: true, eventId, eventType, outcome: 'no-tenant' };

    tenant.subscriptionStatus = 'expired';
    if (sub.canceled_at) tenant.expiresAt = new Date(sub.canceled_at * 1000);
    await manager.save(tenant);
    return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
  }

  private async handleInvoicePaid(
    manager: EntityManager,
    invoice: any,
    eventId: string,
    eventType: string,
  ): Promise<StripeProcessResult> {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
    if (!subscriptionId) return { processed: true, eventId, eventType, outcome: 'ignored' };

    const existing = await manager.findOne(SubscriptionPayment, {
      where: { stripeSubscriptionId: subscriptionId },
      order: { createdAt: 'DESC' },
    });
    const tenantId = existing?.tenantId ?? null;
    if (!tenantId) return { processed: true, eventId, eventType, outcome: 'no-tenant' };

    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
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
  ): Promise<StripeProcessResult> {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
    if (!subscriptionId) return { processed: true, eventId, eventType, outcome: 'ignored' };

    const existing = await manager.findOne(SubscriptionPayment, {
      where: { stripeSubscriptionId: subscriptionId },
      order: { createdAt: 'DESC' },
    });
    const tenantId = existing?.tenantId ?? null;
    if (!tenantId) return { processed: true, eventId, eventType, outcome: 'no-tenant' };

    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
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

    if (tenant) {
      tenant.subscriptionStatus = 'grace';
      const graceDays = Number(this.config.get<string>('STRIPE_GRACE_DAYS') ?? 7);
      tenant.graceEndsAt = new Date(Date.now() + graceDays * 24 * 3600 * 1000);
      await manager.save(tenant);
    }

    return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
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
