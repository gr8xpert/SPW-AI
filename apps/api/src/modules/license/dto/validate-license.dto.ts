import { IsString, IsOptional, MaxLength } from 'class-validator';

export class ValidateLicenseDto {
  @IsString()
  @MaxLength(50)
  licenseKey: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  domain?: string;
}
