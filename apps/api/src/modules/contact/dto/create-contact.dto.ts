import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ContactSource, ContactPreferences } from '../../../database/entities';

class PreferencesDto implements ContactPreferences {
  @IsString()
  @IsOptional()
  language?: string;

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  locations?: number[];

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  types?: number[];

  @IsInt()
  @IsOptional()
  minPrice?: number;

  @IsInt()
  @IsOptional()
  maxPrice?: number;
}

export class CreateContactDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(['inquiry', 'newsletter', 'import', 'manual', 'api'])
  @IsOptional()
  source?: ContactSource;

  @IsInt()
  @IsOptional()
  sourcePropertyId?: number;

  @ValidateNested()
  @Type(() => PreferencesDto)
  @IsOptional()
  preferences?: PreferencesDto;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  subscribed?: boolean;
}
