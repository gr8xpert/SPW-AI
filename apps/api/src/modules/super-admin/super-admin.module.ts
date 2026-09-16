import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { RateLimitHeadroomService } from './rate-limit-headroom.service';
import { QueueDepthService } from './queue-depth.service';
import { ClientImportController } from './client-import.controller';
import { ClientImportService } from './client-import.service';
import { WEBHOOK_QUEUE } from '../webhook/webhook.service';
import {
  Tenant,
  User,
  Plan,
  LicenseKey,
  CreditBalance,
  CreditTransaction,
  CreditPackage,
  AuditLog,
  EmailSuppression,
  TimeEntry,
} from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';
import { AuthModule } from '../auth/auth.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      User,
      Plan,
      LicenseKey,
      CreditBalance,
      CreditTransaction,
      CreditPackage,
      AuditLog,
      EmailSuppression,
      TimeEntry,
    ]),
    TenantModule,
    // Password reset actions reuse AuthService's reset-link email and
    // RefreshTokenService's sign-out-everywhere.
    AuthModule,
    // Permanent client delete purges the client's stored files.
    UploadModule,
    // 6C — queue-depth observability. We re-register each tracked queue
    // here (BullModule uses 'registerQueue' per module, but the same
    // queue name resolves to the same Redis keys, so InjectQueue below
    // yields handles that share state with the producer modules).
    BullModule.registerQueue(
      { name: WEBHOOK_QUEUE },
      { name: 'email-campaign' },
      { name: 'feed-import' },
      { name: 'migration' },
    ),
  ],
  controllers: [SuperAdminController, ClientImportController],
  providers: [SuperAdminService, RateLimitHeadroomService, QueueDepthService, ClientImportService],
  exports: [SuperAdminService, ClientImportService],
})
export class SuperAdminModule {}
