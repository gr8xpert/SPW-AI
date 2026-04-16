import { IsString, IsNotEmpty, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { TicketPriority, TicketCategory } from '../../../database/entities';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsEnum(['low', 'medium', 'high', 'urgent'])
  @IsOptional()
  priority?: TicketPriority;

  @IsEnum(['technical', 'billing', 'feature_request', 'bug', 'general'])
  @IsOptional()
  category?: TicketCategory;
}
