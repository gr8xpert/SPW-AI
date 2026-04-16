import { IsString, IsOptional, MaxLength } from 'class-validator';

export class GenerateLicenseKeyDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  domain?: string;
}
