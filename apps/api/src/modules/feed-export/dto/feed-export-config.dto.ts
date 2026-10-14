import {
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { XmlFormat, ExportFormat, ExportListingScope } from '../../../database/entities';

export class UpdateFeedExportConfigDto {
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsArray()
  @IsEnum(['xml', 'json'], { each: true })
  @IsOptional()
  allowedFormats?: ExportFormat[];

  @IsOptional()
  propertyFilter?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  includeUnpublished?: boolean;

  @IsBoolean()
  @IsOptional()
  includeSold?: boolean;

  @IsIn(['all', 'own'])
  @IsOptional()
  listingScope?: ExportListingScope;

  @IsEnum(['kyero', 'idealista', 'generic'])
  @IsOptional()
  xmlFormat?: XmlFormat;

  @IsInt()
  @Min(60)
  @Max(86400)
  @IsOptional()
  cacheTtl?: number;
}

// The JSON feed's own settings (Feed Export → JSON tab).
export class UpdateJsonFeedDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  includeUnpublished?: boolean;

  @IsBoolean()
  @IsOptional()
  includeSold?: boolean;

  @IsIn(['all', 'own'])
  @IsOptional()
  listingScope?: ExportListingScope;
}
