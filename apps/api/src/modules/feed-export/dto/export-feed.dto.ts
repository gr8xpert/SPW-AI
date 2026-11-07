import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { EXPORT_FEED_FORMATS, ExportFeedFormat, ExportListingScope } from '../../../database/entities';

// Feed Export -> Feeds: one extra feed's settings.
export class UpdateExportFeedDto {
  @IsString()
  @Length(1, 120)
  @IsOptional()
  title?: string;

  @IsIn(EXPORT_FEED_FORMATS as unknown as string[])
  @IsOptional()
  format?: ExportFeedFormat;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  includeUnpublished?: boolean;

  @IsIn(['all', 'own', 'selected'])
  @IsOptional()
  listingScope?: ExportListingScope;

  @IsArray()
  @ArrayMaxSize(20000)
  @IsInt({ each: true })
  @IsOptional()
  propertyIds?: number[];

  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[a-z]{2}$/, { each: true })
  @IsOptional()
  languages?: string[];

  @IsString()
  @MaxLength(500)
  @IsOptional()
  propertyUrlPattern?: string;
}

// References read from an old feed file; matched to the client's listings.
export class MatchReferencesDto {
  @IsArray()
  @ArrayMaxSize(20000)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  references: string[];
}
