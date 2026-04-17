import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Tenant, WebhookDelivery } from '../../database/entities';
import { WebhookService, WEBHOOK_QUEUE } from './webhook.service';
import { WebhookProcessor } from './webhook.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookDelivery, Tenant]),
    BullModule.registerQueue({ name: WEBHOOK_QUEUE }),
  ],
  providers: [WebhookService, WebhookProcessor],
  exports: [WebhookService],
})
export class WebhookModule {}
