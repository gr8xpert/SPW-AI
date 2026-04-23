import { IsOptional, IsNumber, IsString, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyStatus } from '../../../database/entities/property.entity';

export class ListPropertyDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'sold', 'rented', 'archived'])
  status?: PropertyStatus;

  @IsOptional()
  @IsIn(['manual', 'feed', 'import'])
  source?: string;

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
  limit?: number = 20;
}
