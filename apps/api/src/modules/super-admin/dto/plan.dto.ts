import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  MinLength,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlanFeatures } from '../../../database/entities/plan.entity';

export class PlanFeaturesDto implements PlanFeatures {
  @IsBoolean()
  feeds: boolean;

  @IsBoolean()
  campaigns: boolean;

  @IsBoolean()
  analytics: boolean;

  @IsBoolean()
  apiAccess: boolean;

  @IsBoolean()
  customBranding: boolean;
}

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  priceMonthly?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  priceYearly?: number;

  @IsNumber()
  @Min(1)
  maxProperties: number;

  @IsNumber()
  @Min(1)
  maxUsers: number;

  @ValidateNested()
  @Type(() => PlanFeaturesDto)
  @IsOptional()
  features?: PlanFeaturesDto;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  priceMonthly?: number | null;

  @IsNumber()
  @IsOptional()
  @Min(0)
  priceYearly?: number | null;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxProperties?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  maxUsers?: number;

  @ValidateNested()
  @Type(() => PlanFeaturesDto)
  @IsOptional()
  features?: PlanFeaturesDto;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
