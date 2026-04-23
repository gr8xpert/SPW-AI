import { IsArray, IsInt, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class TranslatePropertyDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  targetLanguages: string[];

  @IsOptional()
  @IsString()
  sourceLanguage?: string;
}

export class BulkTranslateDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  targetLanguages: string[];

  @IsOptional()
  @IsString()
  sourceLanguage?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  propertyIds?: number[];
}

export class TranslateEntityDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  targetLanguages: string[];

  @IsOptional()
  @IsString()
  sourceLanguage?: string;
}
