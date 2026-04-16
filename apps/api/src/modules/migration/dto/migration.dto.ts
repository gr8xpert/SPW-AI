import { IsEnum, IsOptional } from 'class-validator';
import { MigrationType, MigrationSourceFormat } from '../../../database/entities';

export class StartMigrationDto {
  @IsEnum(['full', 'properties_only', 'settings_only'])
  @IsOptional()
  type?: MigrationType;

  @IsEnum(['skip', 'overwrite', 'new_reference'])
  @IsOptional()
  conflictHandling?: 'skip' | 'overwrite' | 'new_reference';
}

export interface MigrationValidationResult {
  valid: boolean;
  format: MigrationSourceFormat;
  counts: {
    properties: number;
    locations: number;
    types: number;
    features: number;
    labels: number;
  };
  conflicts: {
    properties: string[];
  };
  errors: string[];
}

export interface MigrationData {
  properties?: Array<{
    reference: string;
    title?: Record<string, string>;
    description?: Record<string, string>;
    price?: number;
    currency?: string;
    bedrooms?: number;
    bathrooms?: number;
    buildSize?: number;
    plotSize?: number;
    location_name?: string;
    property_type?: string;
    features?: string[];
    images?: string[];
    listing_type?: 'sale' | 'rent';
  }>;
  locations?: Array<{
    name: string | Record<string, string>;
    level?: string;
    parent_name?: string;
  }>;
  property_types?: Array<{
    name: string | Record<string, string>;
  }>;
  features?: Array<{
    name: string | Record<string, string>;
    category?: string;
  }>;
  labels?: Array<{
    key: string;
    translations: Record<string, string>;
  }>;
}
