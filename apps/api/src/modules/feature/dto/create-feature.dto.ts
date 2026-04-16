import { IsObject, IsString, IsOptional, IsNumber, IsBoolean, IsIn } from 'class-validator';
import { FeatureCategory } from '../../../database/entities/feature.entity';

export class CreateFeatureDto {
  @IsIn(['interior', 'exterior', 'community', 'climate', 'views', 'security', 'parking', 'other'])
  category: FeatureCategory;

  @IsObject()
  name: Record<string, string>;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
