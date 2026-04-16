import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CreditDashboardController,
  CreditAdminController,
  CreditWebmasterController,
} from './credit.controller';
import { CreditService } from './credit.service';
import {
  CreditBalance,
  CreditTransaction,
  Tenant,
  Ticket,
} from '../../database/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditBalance,
      CreditTransaction,
      Tenant,
      Ticket,
    ]),
  ],
  controllers: [
    CreditDashboardController,
    CreditAdminController,
    CreditWebmasterController,
  ],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}
