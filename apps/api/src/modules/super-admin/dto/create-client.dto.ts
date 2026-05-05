import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  MinLength,
  MaxLength,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionStatus, BillingCycle, BillingSource, TenantSettings, TenantFeatureFlags } from '@spm/shared';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(6)
  adminPassword: string;

  @IsString()
  @IsOptional()
  adminName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  domain?: string;

  @IsEmail()
  @IsOptional()
  ownerEmail?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  siteName?: string;

  @IsUrl()
  @IsOptional()
  apiUrl?: string;

  @IsNumber()
  planId: number;

  @IsEnum(['active', 'grace', 'expired', 'manual', 'internal'])
  @IsOptional()
  subscriptionStatus?: SubscriptionStatus;

  @IsEnum(['monthly', 'yearly'])
  @IsOptional()
  billingCycle?: BillingCycle;

  @IsEnum(['manual', 'paddle', 'internal'])
  @IsOptional()
  billingSource?: BillingSource;

  @IsOptional()
  expiresAt?: Date;

  @IsBoolean()
  @IsOptional()
  adminOverride?: boolean;

  @IsBoolean()
  @IsOptional()
  isInternal?: boolean;

  @IsBoolean()
  @IsOptional()
  widgetEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  aiSearchEnabled?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  widgetFeatures?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  settings?: Partial<TenantSettings>;

  @IsOptional()
  featureFlags?: Partial<TenantFeatureFlags>;
}
