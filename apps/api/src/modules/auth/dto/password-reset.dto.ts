import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class ForgotPasswordDto {
  // Trimmed before validation: phone autofill often adds a trailing space.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  email: string;
}

export class ResetPasswordWithTokenDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  token: string;

  // Min 8 matches LoginDto — anything shorter could never be used to sign in.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
