import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SubscriptionStatus } from '@spm/shared';

export class QueryClientsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['active', 'grace', 'expired', 'manual', 'internal'])
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isInternal?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  adminOverride?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  planId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  // Whitelisted to prevent column-name injection into the ORDER BY clause.
  @IsOptional()
  @IsIn([
    'createdAt',
    'name',
    'slug',
    'subscriptionStatus',
    'expiresAt',
    'isActive',
    'planId',
  ])
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
