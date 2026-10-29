import { IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PLUGIN_PLANS } from '../plugin-plans';

const PLAN_IDS = Object.keys(PLUGIN_PLANS);

// Super admin -> Plugin licences. camelCase like the rest of the dashboard API.
export class CreatePluginLicenseDto {
  @IsIn(PLAN_IDS)
  plan: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string;

  // Paid period in months from today (default 12). Ignored when expiresAt is given.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  // Overrides the plan's site limit (e.g. a custom agency deal).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  sitesAllowed?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}

export class UpdatePluginLicenseDto {
  @IsOptional()
  @IsIn(PLAN_IDS)
  plan?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  sitesAllowed?: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(255)
  customerName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ExtendPluginLicenseDto {
  @IsInt()
  @Min(1)
  @Max(36)
  months: number;
}

export class RegeneratePluginKeyDto {
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
