import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const KINDS = ['label', 'feature', 'property_type'] as const;

export class ListMemoryQueryDto {
  @IsOptional()
  @IsIn(KINDS)
  kind?: (typeof KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

export class SaveMemoryDto {
  @IsIn(KINDS)
  kind: (typeof KINDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  english: string;

  @Matches(/^[a-z]{2}(-[a-z]{2})?$/)
  lang: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}

export class FillMemoryDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[a-z]{2}$/, { each: true })
  languages?: string[];
}

export class RemoveMemoryDto {
  @IsIn(KINDS)
  kind: (typeof KINDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  sourceKey: string;

  @IsOptional()
  @Matches(/^[a-z]{2}(-[a-z]{2})?$/)
  lang?: string;
}
