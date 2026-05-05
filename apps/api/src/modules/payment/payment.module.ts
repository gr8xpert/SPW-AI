import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CreditBalance,
  CreditPackage,
  CreditTransaction,
  Plan,
  ProcessedPaddleEvent,
  ProcessedStripeEvent,
  SubscriptionPayment,
  Tenant,
} from '../../database/entities';
import { BillingCheckoutController } from './billing-checkout.controller';
import { PaddleCheckoutService } from './paddle-checkout.service';
import { PaddleWebhookController } from './paddle-webhook.controller';
import { PaddleWebhookService } from './paddle-webhook.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeBillingController } from './stripe-billing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      Plan,
      SubscriptionPayment,
      ProcessedPaddleEvent,
      CreditPackage,
      ProcessedStripeEvent,
      CreditBalance,
      CreditTransaction,
    ]),
  ],
  controllers: [
    PaddleWebhookController,
    BillingCheckoutController,
    StripeWebhookController,
    StripeBillingController,
  ],
  providers: [
    PaddleWebhookService,
    PaddleCheckoutService,
    StripeCheckoutService,
    StripeWebhookService,
  ],
  exports: [
    PaddleWebhookService,
    PaddleCheckoutService,
    StripeCheckoutService,
    StripeWebhookService,
  ],
})
export class PaymentModule {}
