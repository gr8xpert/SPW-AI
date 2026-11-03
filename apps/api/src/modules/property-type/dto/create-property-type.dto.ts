import { ArrayMaxSize, IsArray, IsInt, IsObject, IsString, IsOptional, IsNumber, IsBoolean, Min, MinLength, MaxLength } from 'class-validator';

export class CreatePropertyTypeDto {
  @IsNumber()
  @IsOptional()
  parentId?: number;

  @IsObject()
  name: Record<string, string>; // { en: "Villa", es: "Villa" }

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  icon?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  // "Other spellings": feed names that belong to this type.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  aliases?: string[];
}

export class MergePropertyTypeDto {
  @IsInt()
  @Min(1)
  targetId: number;
}
