import { IsObject, IsString, IsOptional, IsNumber, IsBoolean, IsIn, MinLength, MaxLength } from 'class-validator';
import { LocationLevel } from '../../../database/entities/location.entity';

export class CreateLocationDto {
  @IsNumber()
  @IsOptional()
  parentId?: number;

  @IsIn(['region', 'province', 'area', 'municipality', 'town', 'urbanization'])
  level: LocationLevel;

  @IsObject()
  name: Record<string, string>;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug: string;

  @IsString()
  @IsOptional()
  externalId?: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
