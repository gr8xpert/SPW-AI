import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RefreshToken, WebhookDelivery, Ticket, TicketMessage, MediaFile } from '../../database/entities';
import { CleanupService } from './cleanup.service';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, WebhookDelivery, Ticket, TicketMessage, MediaFile]),
    ScheduleModule.forRoot(),
    UploadModule,
  ],
  providers: [CleanupService],
  exports: [CleanupService],
})
export class MaintenanceModule {}
