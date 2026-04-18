import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Plan,
  ProcessedPaddleEvent,
  SubscriptionPayment,
  Tenant,
} from '../../database/entities';
import { BillingCheckoutController } from './billing-checkout.controller';
import { PaddleCheckoutService } from './paddle-checkout.service';
import { PaddleWebhookController } from './paddle-webhook.controller';
import { PaddleWebhookService } from './paddle-webhook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      Plan,
      SubscriptionPayment,
      ProcessedPaddleEvent,
    ]),
  ],
  controllers: [PaddleWebhookController, BillingCheckoutController],
  providers: [PaddleWebhookService, PaddleCheckoutService],
  exports: [PaddleWebhookService, PaddleCheckoutService],
})
export class PaymentModule {}
