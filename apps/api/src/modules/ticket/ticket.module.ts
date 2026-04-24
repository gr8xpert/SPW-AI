import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket, TicketMessage, User } from '../../database/entities';
import { TicketService } from './ticket.service';
import { TicketNotificationService } from './ticket-notification.service';
import { TicketController, SuperAdminTicketController } from './ticket.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketMessage, User])],
  controllers: [TicketController, SuperAdminTicketController],
  providers: [TicketService, TicketNotificationService],
  exports: [TicketService, TicketNotificationService],
})
export class TicketModule {}
