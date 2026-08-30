import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket, TicketMessage, User, TimeEntry } from '../../database/entities';
import { TicketService } from './ticket.service';
import { TicketNotificationService } from './ticket-notification.service';
import { TicketController, SuperAdminTicketController } from './ticket.controller';
import { InboundEmailController } from './inbound-email.controller';
import { InboundEmailService } from './inbound-email.service';
import { InboundAuthGuard } from './inbound-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketMessage, User, TimeEntry])],
  controllers: [TicketController, SuperAdminTicketController, InboundEmailController],
  providers: [TicketService, TicketNotificationService, InboundEmailService, InboundAuthGuard],
  exports: [TicketService, TicketNotificationService],
})
export class TicketModule {}
