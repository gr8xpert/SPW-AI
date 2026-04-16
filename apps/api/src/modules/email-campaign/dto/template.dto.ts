import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { EmailTemplateType } from '../../../database/entities';

export class CreateTemplateDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(255)
  subject: string;

  @IsString()
  bodyHtml: string;

  @IsString()
  @IsOptional()
  bodyText?: string;

  @IsEnum(['property_alert', 'newsletter', 'welcome', 'custom'])
  @IsOptional()
  type?: EmailTemplateType;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdateTemplateDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  bodyHtml?: string;

  @IsString()
  @IsOptional()
  bodyText?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
