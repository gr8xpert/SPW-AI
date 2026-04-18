import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsInt, Min } from 'class-validator';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { PaddleCheckoutService } from './paddle-checkout.service';

// 6E — Tenant-facing checkout endpoint. Issues a Paddle hosted-checkout URL
// for the given (planId, billingCycle). The dashboard redirects the
// browser to the returned `url`; the rest of the lifecycle is handled by
// the inbound webhook in 6A.

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
  constructor(private readonly checkout: PaddleCheckoutService) {}

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
    return { url: result.url, transactionId: result.transactionId };
  }
}
