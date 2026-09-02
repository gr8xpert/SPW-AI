import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  IsObject,
  IsIn,
  MinLength,
  MaxLength,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionStatus, BillingCycle, BillingSource, TenantSettings, TenantFeatureFlags, DashboardAddons, TenantTier } from '@spm/shared';

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

  @IsEnum(['manual', 'stripe', 'internal'])
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

  @IsBoolean()
  @IsOptional()
  feedImagesToR2?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  widgetFeatures?: string[];

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

  // 3-tier commercial plan. When omitted, defaults to Tier 1. When set,
  // the service applies TIER_PRESETS as the base for dashboardAddons —
  // any dashboardAddons values passed alongside override that preset.
  @IsIn([1, 2, 3])
  @IsOptional()
  tier?: TenantTier;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  xeroContactId?: string;
}
