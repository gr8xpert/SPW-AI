import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateTypeNodeDto {
  // Null/absent: a group.
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  parentId?: number | null;

  @IsString()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  codes?: string[];

  @IsOptional()
  @IsObject()
  translations?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  aliases?: string[];
}

export class UpdateTypeNodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  codes?: string[];

  @IsOptional()
  @IsObject()
  translations?: Record<string, string>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsIn(['ok', 'needs_review', 'ai_suggested'])
  status?: 'ok' | 'needs_review' | 'ai_suggested';

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class MoveTypeNodeDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  parentId?: number | null;
}

export class ReapplyTypesDto {
  @IsOptional()
  @IsInt()
  tenantId?: number;
}
