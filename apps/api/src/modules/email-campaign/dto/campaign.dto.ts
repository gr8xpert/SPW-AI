import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// Who gets the campaign: subscribed contacts, narrowed by these (all must match).
export class RecipientFilterDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @IsOptional()
  tags?: string[];

  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @IsOptional()
  locations?: number[];
}

export class CreateCampaignDto {
  @IsInt()
  templateId: number;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  subject?: string;

  @ValidateNested()
  @Type(() => RecipientFilterDto)
  @IsOptional()
  recipientFilter?: RecipientFilterDto;

  @IsArray()
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  @IsOptional()
  featuredProperties?: number[];

  // Listing references, resolved to ids (an alternative to featuredProperties).
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  featuredReferences?: string[];

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}

export class UpdateCampaignDto {
  @IsInt()
  @IsOptional()
  templateId?: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  subject?: string;

  @ValidateNested()
  @Type(() => RecipientFilterDto)
  @IsOptional()
  recipientFilter?: RecipientFilterDto;

  @IsArray()
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  @IsOptional()
  featuredProperties?: number[];

  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  featuredReferences?: string[];

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}

export class ScheduleCampaignDto {
  @IsDateString()
  scheduledAt: string;
}

export class TestCampaignDto {
  @IsEmail()
  email: string;
}

export class CampaignRecipientsQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsIn(['pending', 'sent', 'failed', 'opened', 'clicked', 'unsubscribed'])
  @IsOptional()
  status?: string;
}

export class RecipientCountDto {
  @ValidateNested()
  @Type(() => RecipientFilterDto)
  @IsOptional()
  recipientFilter?: RecipientFilterDto;
}
