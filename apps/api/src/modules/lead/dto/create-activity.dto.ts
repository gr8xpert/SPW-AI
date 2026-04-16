import { IsString, IsEnum, IsOptional } from 'class-validator';
import { LeadActivityType } from '../../../database/entities';

export class CreateActivityDto {
  @IsEnum(['note', 'call', 'email', 'sms', 'viewing', 'offer', 'meeting', 'status_change', 'assignment'])
  type: LeadActivityType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
