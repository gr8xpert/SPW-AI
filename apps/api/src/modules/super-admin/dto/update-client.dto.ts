import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  IsObject,
  MinLength,
  MaxLength,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionStatus, BillingCycle, BillingSource, TenantSettings, TenantFeatureFlags, DashboardAddons } from '@spm/shared';

export class UpdateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @IsOptional()
  name?: string;

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
  @IsOptional()
  planId?: number;

  @IsEnum(['active', 'grace', 'expired', 'manual', 'internal'])
  @IsOptional()
  subscriptionStatus?: SubscriptionStatus;

  @IsEnum(['monthly', 'yearly'])
  @IsOptional()
  billingCycle?: BillingCycle;

  @IsEnum(['manual', 'stripe', 'internal'])
  @IsOptional()
  billingSource?: BillingSource;

  @IsOptional()
  expiresAt?: Date | null;

  @IsOptional()
  graceEndsAt?: Date | null;

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

  @IsBoolean()
  @IsOptional()
  feedImagesToR2?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  widgetFeatures?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  settings?: Partial<TenantSettings>;

  @IsOptional()
  @IsObject()
  featureFlags?: Partial<TenantFeatureFlags>;

  @IsOptional()
  @IsObject()
  dashboardAddons?: Partial<DashboardAddons>;
}

export class ExtendSubscriptionDto {
  @IsNumber()
  days: number;
}

export class ManualActivationDto {
  @IsEnum(['monthly', 'yearly'])
  billingCycle: BillingCycle;

  @IsNumber()
  @IsOptional()
  durationDays?: number;
}
