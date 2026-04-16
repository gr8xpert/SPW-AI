import { IsEnum, IsOptional, IsInt } from 'class-validator';
import { TicketStatus, TicketPriority } from '../../../database/entities';

export class UpdateTicketDto {
  @IsEnum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'])
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(['low', 'medium', 'high', 'urgent'])
  @IsOptional()
  priority?: TicketPriority;

  @IsInt()
  @IsOptional()
  assignedTo?: number;
}
