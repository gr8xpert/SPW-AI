import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsNumber,
  Min,
} from 'class-validator';
import { LeadSource } from '../../../database/entities';

export class CreateLeadDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsInt()
  @IsOptional()
  propertyId?: number;

  @IsEnum(['widget_inquiry', 'phone', 'email', 'walkin', 'referral', 'website', 'other'])
  @IsOptional()
  source?: LeadSource;

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

  @IsInt()
  @IsOptional()
  assignedTo?: number;
}
