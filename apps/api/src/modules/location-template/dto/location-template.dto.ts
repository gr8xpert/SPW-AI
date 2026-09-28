import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { LOCATION_LEVELS, TemplateLevel } from '../location-name';

export class CreateTemplateNodeDto {
  @IsOptional()
  @IsInt()
  parentId?: number | null;

  @IsIn(LOCATION_LEVELS)
  level: TemplateLevel;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postcode?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;
}

export class UpdateTemplateNodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsIn(LOCATION_LEVELS)
  level?: TemplateLevel;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  postcode?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number | null;

  @IsOptional()
  @IsIn(['ok', 'needs_review', 'ai_suggested'])
  status?: 'ok' | 'needs_review' | 'ai_suggested';

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class MoveTemplateNodeDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  parentId?: number | null;
}

export class ReapplyTemplateDto {
  @IsOptional()
  @IsInt()
  tenantId?: number;
}
