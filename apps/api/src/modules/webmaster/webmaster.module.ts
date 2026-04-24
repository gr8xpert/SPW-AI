import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebmasterController, WebmasterAdminController } from './webmaster.controller';
import { WebmasterService } from './webmaster.service';
import { TimeEntry, Ticket, User } from '../../database/entities';
import { TicketModule } from '../ticket/ticket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TimeEntry, Ticket, User]),
    TicketModule,
  ],
  controllers: [WebmasterController, WebmasterAdminController],
  providers: [WebmasterService],
  exports: [WebmasterService],
})
export class WebmasterModule {}
