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

// 6E — Paddle outbound checkout. Closes the loop the inbound webhook (6A)
// already half-handles: super-admin sets a paddlePriceId* on each plan,
// the dashboard calls POST /api/billing/checkout, we ask Paddle to create
// a transaction with the plan's price_id and tenant context attached as
// custom_data. The browser is then redirected to Paddle's hosted checkout
// (returned `checkout.url`). When the customer completes payment, Paddle
// fires `subscription.created` / `transaction.completed` webhooks that 6A
// processes — `custom_data.tenantId` is what makes that routing reliable.
//
// Why we don't proxy the Paddle SDK: Paddle Billing v2 has only two HTTP
// calls in this flow (`POST /transactions` to create, `GET /transactions`
// to look up if needed) and the SDK pulls in extra deps for code we'd
// touch in two places. A 30-line fetch wrapper is easier to reason about
// and easier to mock in smoke tests.

export interface CheckoutRequest {
  planId: number;
  billingCycle: BillingCycle;
}

export interface CheckoutResult {
  url: string;
  transactionId: string;
}

interface PaddleTransactionResponse {
  data?: {
    id?: string;
    checkout?: { url?: string | null } | null;
  };
  error?: {
    code?: string;
    detail?: string;
  };
}

@Injectable()
export class PaddleCheckoutService {
  private readonly logger = new Logger(PaddleCheckoutService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  // Test seam: smoke tests inject a mock fetch so we don't hit api.paddle.com.
  // In normal runtime this is just `globalThis.fetch`.
  // (Public so the spec can swap it; not part of the public API surface.)
  fetchImpl: typeof fetch = (...args) => fetch(...args);

  async createCheckout(
    tenantId: number,
    request: CheckoutRequest,
  ): Promise<CheckoutResult> {
    const apiKey = this.config.get<string>('PADDLE_API_KEY');
    if (!apiKey) {
      // Outbound is disabled — operator hasn't set the key. Don't pretend
      // it works; the dashboard surfaces this as a clear error.
      throw new ServiceUnavailableException(
        'Paddle checkout is not configured on this server',
      );
    }

    const plan = await this.planRepo.findOne({ where: { id: request.planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found');
    }

    const priceId =
      request.billingCycle === 'yearly'
        ? plan.paddlePriceIdYearly
        : plan.paddlePriceIdMonthly;
    if (!priceId) {
      throw new BadRequestException(
        `Plan "${plan.name}" has no Paddle price configured for ${request.billingCycle} billing`,
      );
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      // Should never happen — JWT issued for a tenant means the row existed
      // at login. Treat as an integrity error.
      throw new NotFoundException('Tenant not found');
    }

    // Block "upgrades" that wouldn't change anything: same plan, active sub,
    // already on Paddle. Avoids creating a duplicate Paddle subscription
    // that the user would have to manually cancel later.
    if (
      tenant.planId === plan.id &&
      tenant.subscriptionStatus === 'active' &&
      tenant.billingSource === 'paddle' &&
      tenant.billingCycle === request.billingCycle
    ) {
      throw new ConflictException(
        'Tenant is already on this plan with an active Paddle subscription',
      );
    }

    const apiUrl =
      this.config.get<string>('PADDLE_API_URL') ?? 'https://api.paddle.com';
    const endpoint = `${apiUrl.replace(/\/+$/, '')}/transactions`;

    // Paddle Billing v2 transaction-create payload. `custom_data` flows
    // through to every downstream subscription/transaction event, which is
    // how the 6A webhook routes back to the right tenant without extra
    // bookkeeping on our side.
    const body = {
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: 'automatic',
      custom_data: {
        tenantId: String(tenantId),
        planId: String(plan.id),
        billingCycle: request.billingCycle,
      },
    };

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(
        `Paddle transaction-create network failure: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Paddle is unreachable');
    }

    let parsed: PaddleTransactionResponse;
    try {
      parsed = (await response.json()) as PaddleTransactionResponse;
    } catch {
      this.logger.error(
        `Paddle transaction-create returned non-JSON (status=${response.status})`,
      );
      throw new InternalServerErrorException('Paddle returned an invalid response');
    }

    if (!response.ok) {
      const code = parsed.error?.code ?? 'unknown_error';
      const detail = parsed.error?.detail ?? `HTTP ${response.status}`;
      this.logger.error(`Paddle transaction-create failed: ${code} — ${detail}`);
      // Don't leak Paddle's internal error to the tenant — 502 is the
      // honest signal that an upstream we depend on said no.
      throw new InternalServerErrorException(
        `Paddle rejected the checkout request (${code})`,
      );
    }

    const txnId = parsed.data?.id;
    const url = parsed.data?.checkout?.url ?? null;
    if (!txnId || !url) {
      this.logger.error(
        'Paddle transaction-create succeeded but returned no id/url',
      );
      throw new InternalServerErrorException(
        'Paddle did not return a checkout URL',
      );
    }

    return { url, transactionId: txnId };
  }
}
