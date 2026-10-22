import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BUYER_ID_TYPES, BUYER_ROLES, BUYER_SUB_STATUSES, PREFERRED_CONTACTS } from '@spm/shared';
import type { BuyerIdType, BuyerRole, BuyerSubStatus, PreferredContact } from '@spm/shared';

const LEAD_SOURCES = ['widget_inquiry', 'phone', 'email', 'walkin', 'referral', 'website', 'other', 'facebook', 'instagram'] as const;
export const MANUAL_ACTIVITY_TYPES = ['note', 'call', 'email', 'sms', 'viewing', 'meeting', 'offer'] as const;
const BUYER_SORTS = ['lastActivity', 'created', 'name', 'priority'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// '' from a cleared form field means "remove the value".
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class RelatedContactDto {
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  relation?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  phone?: string;
}

export class CreateBuyerDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  firstName?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  lastName?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  phone?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  mobile?: string;

  @IsOptional() @IsIn(BUYER_ROLES)
  role?: BuyerRole;

  @IsOptional() @IsString() @Matches(/^[a-z]{2}(-[a-z]{2})?$/i)
  language?: string;

  @IsOptional() @IsIn(LEAD_SOURCES)
  source?: (typeof LEAD_SOURCES)[number];

  @IsOptional() @Type(() => Number) @IsInt()
  assignedTo?: number;

  @IsOptional() @IsString() @MaxLength(20000)
  notes?: string;
}

// Every field optional; only the keys sent are written. A string field sent
// as '' (or null) clears it.
export class UpdateBuyerDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email?: string;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(100)
  firstName?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(100)
  lastName?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(50)
  phone?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(50)
  mobile?: string | null;

  @IsOptional() @IsIn(BUYER_ROLES)
  role?: BuyerRole;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @Matches(/^[a-z]{2}(-[a-z]{2})?$/i)
  language?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsIn(PREFERRED_CONTACTS)
  preferredContact?: PreferredContact | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  @Matches(/^https?:\/\//i, { message: 'photoUrl must be an http(s) URL' })
  photoUrl?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(255)
  street?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(255)
  street2?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(100)
  city?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(20)
  zip?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(100)
  state?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @Matches(/^[A-Za-z]{2}$/)
  country?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsIn(BUYER_ID_TYPES)
  idType?: BuyerIdType | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(50)
  idNumber?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(255)
  lawyer?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsIn(BUYER_SUB_STATUSES)
  subStatus?: BuyerSubStatus | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3)
  priority?: number;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsNumber() @Min(0)
  dealValue?: number | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString()
  waitingReplyAt?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(150)
  referredBy?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  referralPercent?: number | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString()
  visitStart?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString()
  visitEnd?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(20000)
  notes?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt()
  assignedTo?: number | null;

  // Related agents (replaces the whole list).
  @IsOptional() @IsArray() @ArrayMaxSize(50) @Type(() => Number) @IsInt({ each: true })
  agentIds?: number[];

  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => RelatedContactDto)
  relatedContacts?: RelatedContactDto[];
}

export class ListBuyersDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  q?: string;

  @IsOptional() @IsIn(BUYER_ROLES)
  role?: BuyerRole;

  @IsOptional() @Type(() => Number) @IsInt()
  agentId?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  stageId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(3)
  priority?: number;

  @IsOptional() @IsIn(LEAD_SOURCES)
  source?: (typeof LEAD_SOURCES)[number];

  @IsOptional() @Type(() => Number) @IsInt()
  locationId?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  budgetMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  budgetMax?: number;

  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') @IsBoolean()
  stale?: boolean;

  // Hot buyers only (milestone I).
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') @IsBoolean()
  hot?: boolean;

  // questionKey:optionKey
  @IsOptional() @Matches(/^[a-z0-9_]{1,60}:[a-z0-9_]{1,60}$/)
  answer?: string;

  @IsOptional() @IsIn(BUYER_SORTS)
  sort?: (typeof BUYER_SORTS)[number];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class SetStageDto {
  @Type(() => Number)
  @IsInt()
  stageId: number;
}

export class BuyerActivityDto {
  @IsIn(MANUAL_ACTIVITY_TYPES)
  type: (typeof MANUAL_ACTIVITY_TYPES)[number];

  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  description: string;

  // A note written from a voice recording (Phase 3).
  @IsOptional()
  @IsIn(['voice'])
  via?: 'voice';
}

export class BuyerWeightsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10)
  bedrooms?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10)
  bathrooms?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10)
  buildSize?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10)
  plotSize?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10)
  feature?: number;

  // { [featureId]: 0–10 }; checked entry by entry in BuyerSettingsService.
  @IsOptional() @IsObject()
  featureOverrides?: Record<string, number>;
}

export class NearMissSettingsDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50)
  budgetPercent?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100)
  nearbyKm?: number;
}

export class AlertSettingsDto {
  @IsOptional() @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsIn(['digest', 'instant'])
  delivery?: 'digest' | 'instant';

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'digestTime must be HH:MM' })
  digestTime?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90)
  priceDropPercent?: number;
}

export class BuyerSettingsDto {
  @IsOptional() @IsIn(['default', 'round_robin'])
  assignMode?: 'default' | 'round_robin';

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt()
  defaultAgentId?: number | null;

  @IsOptional() @IsArray() @ArrayMaxSize(100) @Type(() => Number) @IsInt({ each: true })
  rotationAgentIds?: number[];

  @IsOptional() @IsBoolean()
  agentsSeeAll?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365)
  staleDays?: number;

  @IsOptional() @ValidateNested() @Type(() => BuyerWeightsDto)
  weights?: BuyerWeightsDto;

  // { default | <lang>: 'https://site/{lang}/property/{segment}' }; checked in
  // BuyerSettingsService ('' clears a language).
  @IsOptional() @IsObject()
  propertyUrlPatterns?: Record<string, string>;

  // { default | <lang>: 'https://site/my-properties/' }; checked in
  // BuyerSettingsService ('' clears a language).
  @IsOptional() @IsObject()
  buyerPageUrls?: Record<string, string>;

  @IsOptional() @ValidateNested() @Type(() => NearMissSettingsDto)
  nearMiss?: NearMissSettingsDto;

  @IsOptional() @ValidateNested() @Type(() => AlertSettingsDto)
  alerts?: AlertSettingsDto;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1440)
  viewingReminderMinutes?: number;

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'agentDigestTime must be HH:MM' })
  agentDigestTime?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  hotScore?: number;
}

// New Leads: the role that moves a website lead into Contacts.
export class NewLeadRoleDto {
  @IsIn(BUYER_ROLES)
  role: BuyerRole;
}

export class ListNewLeadsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;
}
