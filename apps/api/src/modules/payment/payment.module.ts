import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CreditBalance,
  CreditPackage,
  CreditTransaction,
  Plan,
  ProcessedStripeEvent,
  SubscriptionPayment,
  Tenant,
} from '../../database/entities';
import { BillingCheckoutController } from './billing-checkout.controller';
import { StripeBillingController } from './stripe-billing.controller';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeSubscriptionService } from './stripe-subscription.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookService } from './stripe-webhook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      Plan,
      SubscriptionPayment,
      CreditPackage,
      ProcessedStripeEvent,
      CreditBalance,
      CreditTransaction,
    ]),
  ],
  controllers: [
    BillingCheckoutController,
    StripeBillingController,
    StripeWebhookController,
  ],
  providers: [
    StripeCheckoutService,
    StripeSubscriptionService,
    StripeWebhookService,
  ],
  exports: [
    StripeCheckoutService,
    StripeSubscriptionService,
    StripeWebhookService,
  ],
})
export class PaymentModule {}
