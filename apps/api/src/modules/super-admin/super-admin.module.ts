import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { RateLimitHeadroomService } from './rate-limit-headroom.service';
import {
  Tenant,
  User,
  Plan,
  LicenseKey,
  CreditBalance,
  CreditTransaction,
  AuditLog,
  EmailSuppression,
  TimeEntry,
} from '../../database/entities';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      User,
      Plan,
      LicenseKey,
      CreditBalance,
      CreditTransaction,
      AuditLog,
      EmailSuppression,
      TimeEntry,
    ]),
    TenantModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, RateLimitHeadroomService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
