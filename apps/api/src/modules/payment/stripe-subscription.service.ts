import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingCycle } from '@spm/shared';
import { Plan, Tenant } from '../../database/entities';

export interface SubscriptionCheckoutRequest {
  planId: number;
  billingCycle: BillingCycle;
}

export interface SubscriptionCheckoutResult {
  url: string;
  sessionId: string;
}

interface StripeSessionResponse {
  id?: string;
  url?: string | null;
  error?: { type?: string; message?: string };
}

// Plan checkout via Stripe Subscriptions. Super-admin sets a recurring
// price_id on each plan (price_xxx for monthly + yearly). The dashboard
// calls POST /api/billing/checkout, we ask Stripe to create a Checkout
// Session in mode=subscription with the plan's price_id and tenant context
// in metadata. The browser is redirected to the returned `url`. On success
// Stripe fires checkout.session.completed + customer.subscription.created
// webhooks that the StripeWebhookService routes back to the right tenant.
@Injectable()
export class StripeSubscriptionService {
  private readonly logger = new Logger(StripeSubscriptionService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  fetchImpl: typeof fetch = (...args) => fetch(...args);

  async createCheckout(
    tenantId: number,
    request: SubscriptionCheckoutRequest,
  ): Promise<SubscriptionCheckoutResult> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Stripe checkout is not configured on this server',
      );
    }

    const plan = await this.planRepo.findOne({ where: { id: request.planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found');
    }

    const priceId =
      request.billingCycle === 'yearly'
        ? plan.stripePriceIdYearly
        : plan.stripePriceIdMonthly;
    if (!priceId) {
      throw new BadRequestException(
        `Plan "${plan.name}" has no Stripe price configured for ${request.billingCycle} billing`,
      );
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (
      tenant.planId === plan.id &&
      tenant.subscriptionStatus === 'active' &&
      tenant.billingSource === 'stripe' &&
      tenant.billingCycle === request.billingCycle
    ) {
      throw new ConflictException(
        'Tenant is already on this plan with an active Stripe subscription',
      );
    }

    const successUrl =
      this.config.get<string>('STRIPE_SUCCESS_URL') ??
      this.config.get<string>('DASHBOARD_URL') ??
      'http://localhost:3000';
    const cancelUrl =
      this.config.get<string>('STRIPE_CANCEL_URL') ?? successUrl;

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('success_url', `${successUrl}/dashboard/billing?stripe=success`);
    params.append('cancel_url', `${cancelUrl}/dashboard/billing?stripe=cancel`);
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('client_reference_id', String(tenantId));
    params.append('metadata[tenantId]', String(tenantId));
    params.append('metadata[planId]', String(plan.id));
    params.append('metadata[billingCycle]', request.billingCycle);
    params.append('subscription_data[metadata][tenantId]', String(tenantId));
    params.append('subscription_data[metadata][planId]', String(plan.id));
    params.append('subscription_data[metadata][billingCycle]', request.billingCycle);

    let response: Response;
    try {
      response = await this.fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
    } catch (err) {
      this.logger.error(
        `Stripe subscription session-create network failure: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Stripe is unreachable');
    }

    let parsed: StripeSessionResponse;
    try {
      parsed = (await response.json()) as StripeSessionResponse;
    } catch {
      this.logger.error(
        `Stripe subscription session-create returned non-JSON (status=${response.status})`,
      );
      throw new InternalServerErrorException('Stripe returned an invalid response');
    }

    if (!response.ok) {
      const msg = parsed.error?.message ?? `HTTP ${response.status}`;
      this.logger.error(`Stripe subscription session-create failed: ${msg}`);
      throw new InternalServerErrorException('Stripe rejected the checkout request');
    }

    if (!parsed.id || !parsed.url) {
      this.logger.error(
        'Stripe subscription session-create succeeded but returned no id/url',
      );
      throw new InternalServerErrorException('Stripe did not return a checkout URL');
    }

    return { url: parsed.url, sessionId: parsed.id };
  }
}
