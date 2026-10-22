import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SUGGESTION_STATUSES } from '@spm/shared';
import type { SuggestionStatus } from '@spm/shared';

const LISTING_TYPES = ['sale', 'rent', 'holiday_rent', 'development'] as const;
const RECIPIENTS = ['buyer', 'agent'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

// The whole wishlist; what is left out is not wished for.
export class WishlistDto {
  @IsOptional() @IsArray() @ArrayMaxSize(4) @IsIn(LISTING_TYPES, { each: true })
  listingTypes?: (typeof LISTING_TYPES)[number][];

  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true })
  locationIds?: number[];

  @IsOptional() @IsArray() @ArrayMaxSize(100) @Type(() => Number) @IsInt({ each: true })
  propertyTypeIds?: number[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50)
  minBedrooms?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50)
  minBathrooms?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  budgetMin?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  budgetMax?: number;

  @IsOptional() @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minBuildSize?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  maxBuildSize?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  minPlotSize?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0)
  maxPlotSize?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true })
  featureIds?: number[];

  @IsOptional() @IsIn(['buyer', 'agent', 'both'])
  sendMatchesTo?: 'buyer' | 'agent' | 'both';
}

export class MatchQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  // Also list properties already sent or rejected (marked hiddenReason).
  @IsOptional() @Transform(({ value }) => value === true || value === '1' || value === 'true') @IsBoolean()
  all?: boolean;
}

export class AddSuggestionsDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @Type(() => Number) @IsInt({ each: true })
  propertyIds?: number[];

  // Reference or agent reference, as typed by the agent.
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) @MaxLength(100, { each: true })
  references?: string[];
}

export class UpdateSuggestionDto {
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(5000)
  note?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500)
  @Matches(/^https?:\/\/\S+$/i, { message: 'virtualTourUrl must be an http(s) URL' })
  virtualTourUrl?: string | null;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/, { message: 'visitDate must be a date' })
  visitDate?: string | null;

  @IsOptional() @IsIn(SUGGESTION_STATUSES)
  status?: SuggestionStatus;
}

export class SendPropertiesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @Type(() => Number) @IsInt({ each: true })
  propertyIds: number[];

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @IsIn(RECIPIENTS, { each: true })
  recipients: (typeof RECIPIENTS)[number][];

  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000)
  message?: string;

  @IsOptional() @Matches(/^[a-z]{2}$/)
  lang?: string;

  // Send properties already sent to this buyer (or rejected) again.
  @IsOptional() @IsBoolean()
  allowResend?: boolean;
}

// Send a property to the buyers who match it (default: all not sent yet).
export class ReverseSendDto {
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true })
  leadIds?: number[];
}

// An agent's own mark on a property's timeline.
export class SuggestionEventDto {
  @IsIn(['liked', 'rejected', 'cleared', 'viewing', 'offer'])
  event: 'liked' | 'rejected' | 'cleared' | 'viewing' | 'offer';

  @IsOptional() @Transform(trim) @IsString() @MaxLength(255)
  note?: string;
}

export class SuggestionsPdfDto {
  @IsOptional() @Matches(/^[a-z]{2}$/)
  lang?: string;

  // Comma-separated property ids; default every suggested property.
  @IsOptional() @Matches(/^\d+(,\d+){0,29}$/)
  ids?: string;
}
