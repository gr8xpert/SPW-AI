import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsDateString,
  MaxLength,
} from 'class-validator';

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

  @IsOptional()
  recipientFilter?: Record<string, any>;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  featuredProperties?: number[];

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}

export class UpdateCampaignDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  subject?: string;

  @IsOptional()
  recipientFilter?: Record<string, any>;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  featuredProperties?: number[];

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
