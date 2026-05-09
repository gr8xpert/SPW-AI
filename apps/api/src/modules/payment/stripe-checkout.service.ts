import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditPackage, Tenant } from '../../database/entities';

export interface StripeCheckoutResult {
  url: string;
  sessionId: string;
}

interface StripeSessionResponse {
  id?: string;
  url?: string | null;
  error?: {
    type?: string;
    message?: string;
  };
}

@Injectable()
export class StripeCheckoutService {
  private readonly logger = new Logger(StripeCheckoutService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(CreditPackage)
    private readonly packageRepo: Repository<CreditPackage>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  fetchImpl: typeof fetch = (...args) => fetch(...args);

  async createCheckout(
    tenantId: number,
    packageId: number,
    quantity: number = 1,
  ): Promise<StripeCheckoutResult> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new ServiceUnavailableException(
        'Stripe checkout is not configured on this server',
      );
    }

    const pkg = await this.packageRepo.findOne({
      where: { id: packageId },
    });
    if (!pkg || !pkg.isActive) {
      throw new NotFoundException('Credit package not found');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const successUrl =
      this.config.get<string>('STRIPE_SUCCESS_URL') ??
      this.config.get<string>('DASHBOARD_URL') ??
      'http://localhost:3000';
    const cancelUrl =
      this.config.get<string>('STRIPE_CANCEL_URL') ??
      successUrl;

    const apiUrl = 'https://api.stripe.com/v1/checkout/sessions';

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', `${successUrl}/dashboard/billing?stripe=success`);
    params.append('cancel_url', `${cancelUrl}/dashboard/billing?stripe=cancel`);
    // Total hours credited = pkg.hours × quantity. Stripe's line_item
    // quantity charges price × quantity automatically, so we keep the
    // unit_amount per-pack and let Stripe do the multiplication on cost.
    const totalHours = Number(pkg.hours) * quantity;

    params.append('currency', pkg.currency.toLowerCase());
    params.append('line_items[0][quantity]', String(quantity));
    params.append(
      'line_items[0][price_data][currency]',
      pkg.currency.toLowerCase(),
    );
    params.append(
      'line_items[0][price_data][unit_amount]',
      String(Math.round(Number(pkg.totalPrice) * 100)),
    );
    params.append(
      'line_items[0][price_data][product_data][name]',
      `${pkg.name} — ${pkg.hours} Credit Hours`,
    );
    params.append('metadata[tenantId]', String(tenantId));
    params.append('metadata[packageId]', String(pkg.id));
    params.append('metadata[hours]', String(totalHours));
    params.append('metadata[quantity]', String(quantity));

    let response: Response;
    try {
      response = await this.fetchImpl(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
    } catch (err) {
      this.logger.error(
        `Stripe session-create network failure: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException('Stripe is unreachable');
    }

    let parsed: StripeSessionResponse;
    try {
      parsed = (await response.json()) as StripeSessionResponse;
    } catch {
      this.logger.error(
        `Stripe session-create returned non-JSON (status=${response.status})`,
      );
      throw new InternalServerErrorException(
        'Stripe returned an invalid response',
      );
    }

    if (!response.ok) {
      const msg = parsed.error?.message ?? `HTTP ${response.status}`;
      this.logger.error(`Stripe session-create failed: ${msg}`);
      throw new InternalServerErrorException(
        `Stripe rejected the checkout request`,
      );
    }

    const sessionId = parsed.id;
    const url = parsed.url;
    if (!sessionId || !url) {
      this.logger.error(
        'Stripe session-create succeeded but returned no id/url',
      );
      throw new InternalServerErrorException(
        'Stripe did not return a checkout URL',
      );
    }

    return { url, sessionId };
  }
}
