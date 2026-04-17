import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RefreshToken, WebhookDelivery } from '../../database/entities';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, WebhookDelivery]),
    ScheduleModule.forRoot(),
  ],
  providers: [CleanupService],
  exports: [CleanupService],
})
export class MaintenanceModule {}
