import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact, MailerliteConnection, Tenant } from '../../database/entities';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';
import { MailerLiteController, MailerLiteWebhookController } from './mailerlite.controller';
import { MAILERLITE_QUEUE, MailerLiteConnectionService } from './mailerlite-connection.service';
import { MailerLiteSyncService } from './mailerlite-sync.service';
import { MailerLiteWebhookService } from './mailerlite-webhook.service';
import { MailerLiteProcessor } from './mailerlite.processor';
import { MailerLiteCron } from './mailerlite.cron';

// A client's own MailerLite account: contacts and tags sync there, unsubscribes
// and bounces come back. The client designs and sends from MailerLite.
@Module({
  imports: [
    TypeOrmModule.forFeature([MailerliteConnection, Contact, Tenant]),
    BullModule.registerQueue({
      name: MAILERLITE_QUEUE,
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail: 200,
      },
    }),
  ],
  controllers: [MailerLiteController, MailerLiteWebhookController],
  providers: [MailerLiteConnectionService, MailerLiteSyncService, MailerLiteWebhookService, MailerLiteProcessor, MailerLiteCron, DashboardAddonGuard],
})
export class MailerLiteModule {}
