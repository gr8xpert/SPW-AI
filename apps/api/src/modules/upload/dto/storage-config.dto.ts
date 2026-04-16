import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { StorageType } from '../../../database/entities';

export class CreateStorageConfigDto {
  @IsEnum(['local', 's3'])
  storageType: StorageType;

  @IsString()
  @IsOptional()
  s3Bucket?: string;

  @IsString()
  @IsOptional()
  s3Region?: string;

  @IsString()
  @IsOptional()
  s3AccessKey?: string;

  @IsString()
  @IsOptional()
  s3SecretKey?: string;

  @IsString()
  @IsOptional()
  s3Endpoint?: string;

  @IsString()
  @IsOptional()
  cdnUrl?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  maxFileSize?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateStorageConfigDto extends CreateStorageConfigDto {}
