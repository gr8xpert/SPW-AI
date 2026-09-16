import {
  IsArray,
  ArrayNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
} from 'class-validator';

export class BulkGenerateSeoDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  targetLanguages: string[];

  // Off by default: a run normally fills only what's empty, so re-running is
  // cheap and never destroys hand-written SEO.
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;

  @IsOptional()
  @IsBoolean()
  includeSchema?: boolean;

  // Only ever fills an empty slug — see AiSeoProcessor. Existing slugs are
  // live URLs and are never rewritten, not even with overwrite on.
  @IsOptional()
  @IsBoolean()
  includeSlug?: boolean;

  // Restricts the run to specific properties. Omit for the whole catalog.
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  propertyIds?: number[];
}
