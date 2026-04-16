import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsNumber,
  Min,
  IsDateString,
} from 'class-validator';
import { LeadStatus } from '../../../database/entities';

export class UpdateLeadDto {
  @IsEnum(['new', 'contacted', 'qualified', 'viewing_scheduled', 'offer_made', 'negotiating', 'won', 'lost'])
  @IsOptional()
  status?: LeadStatus;

  @IsInt()
  @IsOptional()
  assignedTo?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  budgetMin?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  budgetMax?: number;

  @IsString()
  @IsOptional()
  budgetCurrency?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  preferredLocations?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  preferredTypes?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  preferredFeatures?: number[];

  @IsInt()
  @Min(0)
  @IsOptional()
  preferredBedroomsMin?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  preferredBedroomsMax?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  nextFollowUp?: string;

  // For closing as won
  @IsInt()
  @IsOptional()
  wonPropertyId?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  wonAmount?: number;

  // For closing as lost
  @IsString()
  @IsOptional()
  lostReason?: string;
}
