import { IsOptional, IsNumber, IsString, IsIn, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PropertyStatus, ListingType, PropertySource } from '../../../database/entities/property.entity';
import { PROPERTY_SOURCES } from '@spm/shared';

export class ListPropertyDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'sold', 'rented', 'archived'])
  status?: PropertyStatus;

  @IsOptional()
  @IsIn(['sale', 'rent', 'holiday_rent', 'development'])
  listingType?: ListingType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  propertyTypeId?: number;

  // A place and every place inside it — the same set the Locations page
  // counts, so "2 properties" there opens exactly those 2.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  locationId?: number;

  // Every properties.source value from the shared list, not a hand-copied
  // one: a copy here missed kyero/odoo and 400'd the dashboard's Source filter.
  @IsOptional()
  @IsIn(PROPERTY_SOURCES)
  source?: PropertySource;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isOwnProperty?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBuildSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxBuildSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPlotSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPlotSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTerraceSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxTerraceSize?: number;

  @IsOptional()
  @IsIn(['reference', 'createdAt', 'price', 'status'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
