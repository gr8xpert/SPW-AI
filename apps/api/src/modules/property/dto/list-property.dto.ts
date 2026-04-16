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
