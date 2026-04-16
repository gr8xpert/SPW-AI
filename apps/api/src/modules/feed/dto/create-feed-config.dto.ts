import {
  IsString,
  IsObject,
  IsOptional,
  IsBoolean,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { FeedProvider, FeedCredentials, FeedFieldMapping } from '../../../database/entities/feed-config.entity';

export class CreateFeedConfigDto {
  @IsIn(['resales', 'inmoba', 'infocasa', 'redsp'])
  provider: FeedProvider;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsObject()
  credentials: FeedCredentials;

  @IsObject()
  @IsOptional()
  fieldMapping?: FeedFieldMapping;

  @IsString()
  @IsOptional()
  @Matches(/^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/, {
    message: 'syncSchedule must be a valid cron expression',
  })
  syncSchedule?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
