import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { XeroSyncService } from './xero-sync.service';
import {
  XeroInternalController,
  XeroSyncAdminController,
} from './xero-sync.controller';
import { XeroSyncCron } from './xero-sync.cron';
import { Tenant, XeroInvoiceLog } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([XeroInvoiceLog, Tenant])],
  controllers: [XeroInternalController, XeroSyncAdminController],
  providers: [XeroSyncService, XeroSyncCron],
  exports: [XeroSyncService],
})
export class XeroSyncModule {}
