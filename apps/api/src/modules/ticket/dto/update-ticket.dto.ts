import { IsEnum, IsOptional, IsInt } from 'class-validator';
import { TicketStatus, TicketPriority, TicketCategory } from '../../../database/entities';

export class UpdateTicketDto {
  @IsEnum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'])
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(['low', 'medium', 'high', 'urgent'])
  @IsOptional()
  priority?: TicketPriority;

  @IsEnum(['technical', 'billing', 'feature_request', 'bug', 'general'])
  @IsOptional()
  category?: TicketCategory;

  @IsInt()
  @IsOptional()
  assignedTo?: number;
}
