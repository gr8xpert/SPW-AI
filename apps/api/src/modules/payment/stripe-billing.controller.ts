import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard, TenantGuard } from '../../common/guards';
import { CurrentTenant } from '../../common/decorators';
import { CreditPackage } from '../../database/entities';
import { StripeCheckoutService } from './stripe-checkout.service';

class CreateCreditCheckoutDto {
  @IsInt()
  @Min(1)
  packageId: number;
}

@Controller('api/billing/credits')
@UseGuards(JwtAuthGuard, TenantGuard)
export class StripeBillingController {
  constructor(
    private readonly checkout: StripeCheckoutService,
    @InjectRepository(CreditPackage)
    private readonly packageRepo: Repository<CreditPackage>,
  ) {}

  @Get('packages')
  async listPackages() {
    return this.packageRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', hours: 'ASC' },
    });
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async createCheckout(
    @CurrentTenant() tenantId: number,
    @Body() dto: CreateCreditCheckoutDto,
  ) {
    const result = await this.checkout.createCheckout(tenantId, dto.packageId);
    return { url: result.url, sessionId: result.sessionId };
  }
}
