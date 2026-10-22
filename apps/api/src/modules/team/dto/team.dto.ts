import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsArray,
  MinLength,
  MaxLength,
  IsBoolean,
  IsIn,
  Matches,
  ValidateIf,
} from 'class-validator';
import { UserRoleType, UserRole } from '@spm/shared';
import type { AgentAccess } from '../agent-profile';

export class InviteUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsEnum([UserRole.ADMIN, UserRole.USER])
  role: UserRoleType;

  @IsString()
  @MinLength(8)
  password: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsEnum([UserRole.ADMIN, UserRole.USER])
  @IsOptional()
  role?: UserRoleType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

const PHONE = /^\+?[\d\s().-]{6,40}$/;
const filled = (_: unknown, v: unknown) => v !== undefined && v !== null && v !== '';

// Agents page: a person's website card, switches and dashboard access. On
// create, `name` is required and `email` + `password` when access isn't 'none'
// (checked in the service, which knows the current row on update).
export class AgentDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsIn(['manager', 'agent', 'none'])
  @IsOptional()
  access?: AgentAccess;

  @ValidateIf(filled)
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ValidateIf(filled)
  @IsString()
  @MinLength(8)
  password?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @ValidateIf(filled)
  @Matches(PHONE, { message: 'phone must be a phone number' })
  phone?: string;

  @ValidateIf(filled)
  @Matches(PHONE, { message: 'whatsapp must be a phone number' })
  whatsapp?: string;

  @ValidateIf(filled)
  @IsEmail()
  @MaxLength(200)
  publicEmail?: string;

  // An uploaded photo (R2, or the API host when R2 is off).
  @ValidateIf(filled)
  @Matches(/^https?:\/\/[^\s"'<>]+$/i, { message: 'avatarUrl must be an http(s) URL' })
  @MaxLength(500)
  avatarUrl?: string;

  @IsBoolean()
  @IsOptional()
  showOnWebsite?: boolean;

  @IsBoolean()
  @IsOptional()
  worksBuyers?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}
