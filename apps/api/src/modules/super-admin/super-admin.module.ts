import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
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
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
