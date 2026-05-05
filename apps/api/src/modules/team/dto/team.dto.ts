import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsArray,
  MinLength,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { UserRoleType, UserRole } from '@spm/shared';

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
  @MinLength(6)
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

export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword: string;
}
