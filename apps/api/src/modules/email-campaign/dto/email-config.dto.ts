import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { EmailProvider, EmailEncryption } from '../../../database/entities';

export class CreateEmailConfigDto {
  @IsEnum(['smtp', 'mailgun', 'sendgrid', 'ses'])
  provider: EmailProvider;

  // SMTP settings
  @IsString()
  @IsOptional()
  smtpHost?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  smtpPort?: number;

  @IsString()
  @IsOptional()
  smtpUser?: string;

  @IsString()
  @IsOptional()
  smtpPassword?: string;

  @IsEnum(['tls', 'ssl', 'none'])
  @IsOptional()
  smtpEncryption?: EmailEncryption;

  // API settings
  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  apiDomain?: string;

  // Common settings
  @IsEmail()
  fromEmail: string;

  @IsString()
  @IsOptional()
  fromName?: string;

  @IsEmail()
  @IsOptional()
  replyTo?: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  dailyLimit?: number;
}

export class UpdateEmailConfigDto extends CreateEmailConfigDto {}
