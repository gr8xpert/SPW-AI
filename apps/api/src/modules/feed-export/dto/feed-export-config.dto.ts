import {
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { XmlFormat, ExportFormat } from '../../../database/entities';

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

  @IsEnum(['kyero', 'idealista', 'generic'])
  @IsOptional()
  xmlFormat?: XmlFormat;

  @IsInt()
  @Min(60)
  @Max(86400)
  @IsOptional()
  cacheTtl?: number;
}
