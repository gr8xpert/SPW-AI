import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class SetAdminPasswordDto {
  // Min 8 matches LoginDto — anything shorter could never be used to sign in.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class UpdateClientUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(255)
  email?: string;
}

export class DeleteClientPermanentlyDto {
  // The client's slug, typed by the operator: proof they mean THIS client.
  @IsString()
  confirmSlug: string;
}
