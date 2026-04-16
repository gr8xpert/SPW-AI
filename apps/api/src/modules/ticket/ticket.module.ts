import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket, TicketMessage } from '../../database/entities';
import { TicketService } from './ticket.service';
import { TicketController, SuperAdminTicketController } from './ticket.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketMessage])],
  controllers: [TicketController, SuperAdminTicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
