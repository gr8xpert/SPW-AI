import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillingCycle, SubscriptionStatus } from '@spm/shared';
import {
  ProcessedPaddleEvent,
  SubscriptionPayment,
  Tenant,
} from '../../database/entities';
import {
  verifyPaddleSignature,
  PADDLE_MAX_AGE_SECONDS,
} from './paddle-signature';

// 6A — Paddle inbound webhook handler.
//
// Scope: subscription.created, subscription.updated, subscription.canceled,
// transaction.completed, transaction.payment_failed. Anything else is acked
// with 200 + no-op so Paddle stops retrying — we can add handlers later
// without writing new code in the retry path.
//
// Tenant resolution (in priority order):
//   1. event.data.custom_data.tenantId — set when we create the checkout.
//   2. Existing SubscriptionPayment.paddleSubscriptionId → tenantId lookup.
// If both fail, we record the event as processed and log a warning; we
// don't 500 because Paddle would retry forever on an event we can't route.

interface PaddleEventEnvelope {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: PaddleEventData;
}

interface PaddleEventData {
  id?: string; // sub_xxx (subscription.*) or txn_xxx (transaction.*)
  subscription_id?: string; // present on transaction.* events
  customer_id?: string;
  status?: string;
  billing_cycle?: { interval?: 'month' | 'year' | 'day' | 'week'; frequency?: number };
  next_billed_at?: string | null;
  canceled_at?: string | null;
  items?: Array<{ price?: { id?: string } }>;
  details?: {
    totals?: { grand_total?: string | number; currency_code?: string };
  };
  currency_code?: string;
  custom_data?: { tenantId?: string | number; planId?: string | number } | null;
  payments?: Array<{ error_code?: string; error_message?: string }>;
}

export interface PaddleProcessResult {
  processed: boolean;
  eventId: string;
  eventType: string;
  // 'replay' → seen this eventId before; 'unhandled' → event type we don't
  // act on; 'no-tenant' → couldn't resolve tenant; 'applied' → side-effects
  // written.
  outcome: 'applied' | 'replay' | 'unhandled' | 'no-tenant';
  tenantId?: number;
}

const HANDLED_EVENTS = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
  'transaction.completed',
  'transaction.payment_failed',
]);

@Injectable()
export class PaddleWebhookService {
  private readonly logger = new Logger(PaddleWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(SubscriptionPayment)
    private readonly paymentRepo: Repository<SubscriptionPayment>,
    @InjectRepository(ProcessedPaddleEvent)
    private readonly processedRepo: Repository<ProcessedPaddleEvent>,
  ) {}

  // Entry point from the controller. Verifies the signature against the
  // preserved raw bytes, then dispatches. Throws UnauthorizedException on
  // any signature failure so the controller can return 401.
  async process(options: {
    rawBody: string;
    signatureHeader: string | undefined;
  }): Promise<PaddleProcessResult> {
    const secret = this.config.get<string>('PADDLE_WEBHOOK_SECRET');
    if (!secret) {
      // Missing secret in dev: reject with a clear 401 so integrators don't
      // get silent drops. In prod the boot audit refuses to start without it.
      this.logger.error('PADDLE_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('Paddle webhook not configured');
    }

    const verify = verifyPaddleSignature({
      header: options.signatureHeader,
      rawBody: options.rawBody,
      secret,
      maxAgeSeconds: PADDLE_MAX_AGE_SECONDS,
    });
    if (!verify.ok) {
      throw new UnauthorizedException(`Signature ${verify.reason}`);
    }

    let envelope: PaddleEventEnvelope;
    try {
      envelope = JSON.parse(options.rawBody) as PaddleEventEnvelope;
    } catch {
      throw new BadRequestException('Invalid JSON');
    }

    const eventId = envelope.event_id;
    const eventType = envelope.event_type;
    if (!eventId || !eventType) {
      throw new BadRequestException('Missing event_id or event_type');
    }

    // Dedup: INSERT into processed_paddle_events. A duplicate PK means
    // we've handled this eventId before — Paddle is retrying because a
    // prior ack didn't land, but the side-effects are already in place.
    const alreadySeen = await this.processedRepo.findOne({
      where: { eventId },
    });
    if (alreadySeen) {
      return { processed: true, eventId, eventType, outcome: 'replay' };
    }

    if (!HANDLED_EVENTS.has(eventType)) {
      // Record so future retries of the same event short-circuit; no
      // side-effects to apply.
      await this.recordProcessed(eventId, eventType);
      return { processed: true, eventId, eventType, outcome: 'unhandled' };
    }

    const data = envelope.data ?? {};
    const tenantId = await this.resolveTenantId(data);
    if (!tenantId) {
      this.logger.warn(
        `paddle event ${eventType} id=${eventId} could not be routed to a tenant`,
      );
      await this.recordProcessed(eventId, eventType);
      return { processed: true, eventId, eventType, outcome: 'no-tenant' };
    }

    // Atomic: dedup insert + side-effects in one transaction so a partial
    // failure leaves the event re-playable. Paddle will retry; the dedup
    // row only commits alongside the side-effects.
    await this.dataSource.transaction(async (manager) => {
      await manager.insert(ProcessedPaddleEvent, { eventId, eventType });

      switch (eventType) {
        case 'subscription.created':
        case 'subscription.updated':
          await this.applySubscriptionSync(manager, tenantId, data, eventType);
          break;
        case 'subscription.canceled':
          await this.applySubscriptionCanceled(manager, tenantId, data);
          break;
        case 'transaction.completed':
          await this.applyTransactionCompleted(manager, tenantId, data);
          break;
        case 'transaction.payment_failed':
          await this.applyPaymentFailed(manager, tenantId, data);
          break;
      }
    });

    return { processed: true, eventId, eventType, outcome: 'applied', tenantId };
  }

  // --- helpers ------------------------------------------------------------

  private async recordProcessed(eventId: string, eventType: string): Promise<void> {
    try {
      await this.processedRepo.insert({ eventId, eventType });
    } catch {
      // Concurrent delivery of the same eventId lost the race — the other
      // insert won and has the side-effects (or is about to). Safe to ignore.
    }
  }

  private async resolveTenantId(data: PaddleEventData): Promise<number | null> {
    const fromCustomData = coerceTenantId(data.custom_data?.tenantId);
    if (fromCustomData) return fromCustomData;

    // For transaction.* events we also get subscription_id; subscription.*
    // events use data.id as the subscription id.
    const subId = data.subscription_id ?? data.id;
    if (subId && typeof subId === 'string' && subId.startsWith('sub_')) {
      const existing = await this.paymentRepo.findOne({
        where: { paddleSubscriptionId: subId },
        order: { createdAt: 'DESC' },
      });
      if (existing) return existing.tenantId;
    }
    return null;
  }

  private async applySubscriptionSync(
    manager: import('typeorm').EntityManager,
    tenantId: number,
    data: PaddleEventData,
    eventType: string,
  ): Promise<void> {
    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    if (!tenant) return;

    const subscriptionStatus = mapPaddleStatus(data.status);
    const billingCycle = mapBillingCycle(data.billing_cycle?.interval);
    const nextBilledAt = parseDate(data.next_billed_at);

    tenant.billingSource = 'paddle';
    if (billingCycle) tenant.billingCycle = billingCycle;
    if (subscriptionStatus) tenant.subscriptionStatus = subscriptionStatus;
    if (nextBilledAt) tenant.expiresAt = nextBilledAt;
    // A fresh active sync clears any lingering grace window.
    if (subscriptionStatus === 'active') tenant.graceEndsAt = null;
    const planOverride = coerceTenantId(data.custom_data?.planId);
    if (planOverride) tenant.planId = planOverride;
    await manager.save(tenant);

    // Record the sync as a 'new' payment on creation; updates don't write
    // a payment row (that's what transaction.completed is for). This keeps
    // the subscription_payments ledger a true ledger — one row per money
    // movement, not per subscription-state-change.
    if (eventType === 'subscription.created') {
      const subId = typeof data.id === 'string' ? data.id : null;
      const customerId = typeof data.customer_id === 'string' ? data.customer_id : null;
      await manager.insert(SubscriptionPayment, {
        tenantId,
        planId: tenant.planId,
        type: 'new',
        amount: 0,
        currency: data.currency_code ?? 'EUR',
        billingCycle: billingCycle ?? 'monthly',
        paddleSubscriptionId: subId,
        paddleCustomerId: customerId,
        status: 'pending',
        paddleWebhookData: data as unknown as Record<string, any>,
      });
    }
  }

  private async applySubscriptionCanceled(
    manager: import('typeorm').EntityManager,
    tenantId: number,
    data: PaddleEventData,
  ): Promise<void> {
    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    if (!tenant) return;
    tenant.subscriptionStatus = 'expired';
    const canceledAt = parseDate(data.canceled_at);
    if (canceledAt) tenant.expiresAt = canceledAt;
    await manager.save(tenant);
  }

  private async applyTransactionCompleted(
    manager: import('typeorm').EntityManager,
    tenantId: number,
    data: PaddleEventData,
  ): Promise<void> {
    const amount = toDecimalNumber(data.details?.totals?.grand_total);
    const currency = data.details?.totals?.currency_code ?? data.currency_code ?? 'EUR';
    const txnId = typeof data.id === 'string' ? data.id : null;
    const subId = typeof data.subscription_id === 'string' ? data.subscription_id : null;
    const customerId = typeof data.customer_id === 'string' ? data.customer_id : null;

    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    const planId = tenant?.planId ?? null;

    await manager.insert(SubscriptionPayment, {
      tenantId,
      planId: planId ?? 0,
      type: 'renewal',
      amount: amount ?? 0,
      currency,
      billingCycle: tenant?.billingCycle ?? 'monthly',
      paddleTransactionId: txnId,
      paddleSubscriptionId: subId,
      paddleCustomerId: customerId,
      status: 'completed',
      paidAt: new Date(),
      paddleWebhookData: data as unknown as Record<string, any>,
    });

    if (tenant) {
      tenant.subscriptionStatus = 'active';
      tenant.graceEndsAt = null;
      tenant.billingSource = 'paddle';
      await manager.save(tenant);
    }
  }

  private async applyPaymentFailed(
    manager: import('typeorm').EntityManager,
    tenantId: number,
    data: PaddleEventData,
  ): Promise<void> {
    const txnId = typeof data.id === 'string' ? data.id : null;
    const subId = typeof data.subscription_id === 'string' ? data.subscription_id : null;
    const customerId = typeof data.customer_id === 'string' ? data.customer_id : null;
    const failure = data.payments?.[0]?.error_message ?? data.payments?.[0]?.error_code ?? 'unknown';

    const tenant = await manager.findOne(Tenant, { where: { id: tenantId } });
    const planId = tenant?.planId ?? 0;

    await manager.insert(SubscriptionPayment, {
      tenantId,
      planId,
      type: 'renewal',
      amount: 0,
      currency: data.currency_code ?? 'EUR',
      billingCycle: tenant?.billingCycle ?? 'monthly',
      paddleTransactionId: txnId,
      paddleSubscriptionId: subId,
      paddleCustomerId: customerId,
      status: 'failed',
      failureReason: failure.slice(0, 500),
      paddleWebhookData: data as unknown as Record<string, any>,
    });

    if (tenant) {
      // Move into grace: keep widget live for a short window so a
      // retry/payment-method-update can recover without an outage.
      tenant.subscriptionStatus = 'grace';
      const graceDays = Number(this.config.get<string>('PADDLE_GRACE_DAYS') ?? 7);
      tenant.graceEndsAt = new Date(Date.now() + graceDays * 24 * 3600 * 1000);
      await manager.save(tenant);
    }
  }
}

function coerceTenantId(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function mapPaddleStatus(status: string | undefined): SubscriptionStatus | null {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'grace';
    case 'canceled':
    case 'paused':
      return 'expired';
    default:
      return null;
  }
}

function mapBillingCycle(interval: string | undefined): BillingCycle | null {
  if (interval === 'month') return 'monthly';
  if (interval === 'year') return 'yearly';
  return null;
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDecimalNumber(raw: unknown): number | null {
  if (raw == null) return null;
  // Paddle Billing sends amounts as minor-unit strings ("1299" = €12.99).
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}
