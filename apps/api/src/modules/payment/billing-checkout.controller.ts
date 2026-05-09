import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, Min } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { Plan } from '../../database/entities';
import { StripeSubscriptionService } from './stripe-subscription.service';

// Tenant-facing plan checkout. Issues a Stripe Checkout Session URL for
// the given (planId, billingCycle). The dashboard redirects the browser
// to the returned `url`; the rest of the lifecycle is handled by the
// inbound Stripe webhook in StripeWebhookService.
export class CreateCheckoutDto {
  @IsInt()
  @Min(1)
  planId: number;

  @IsIn(['monthly', 'yearly'])
  billingCycle: 'monthly' | 'yearly';
}

@Controller('api/billing')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BillingCheckoutController {
  constructor(
    private readonly checkout: StripeSubscriptionService,
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  @Get('plans')
  async listPlans() {
    return this.planRepo.find({
      where: { isActive: true },
      order: { priceMonthly: 'ASC' },
    });
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async create(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateCheckoutDto,
  ) {
    const result = await this.checkout.createCheckout(tenantId, {
      planId: dto.planId,
      billingCycle: dto.billingCycle,
    });
    return { url: result.url, sessionId: result.sessionId };
  }
}
