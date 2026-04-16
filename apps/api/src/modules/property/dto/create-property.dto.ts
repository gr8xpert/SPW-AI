import { IsString, IsOptional, IsNumber, IsBoolean, IsObject, IsArray, IsIn, IsDateString, MinLength, MaxLength } from 'class-validator';
import { ListingType, PropertySource, PropertyStatus, PropertyImage } from '../../../database/entities/property.entity';

export class CreatePropertyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  reference: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  agentReference?: string;

  @IsIn(['sale', 'rent', 'development'])
  listingType: ListingType;

  @IsNumber()
  @IsOptional()
  propertyTypeId?: number;

  @IsNumber()
  @IsOptional()
  locationId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  urbanization?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsBoolean()
  @IsOptional()
  priceOnRequest?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  @IsNumber()
  @IsOptional()
  bedrooms?: number;

  @IsNumber()
  @IsOptional()
  bathrooms?: number;

  @IsNumber()
  @IsOptional()
  buildSize?: number;

  @IsNumber()
  @IsOptional()
  plotSize?: number;

  @IsNumber()
  @IsOptional()
  terraceSize?: number;

  @IsNumber()
  @IsOptional()
  gardenSize?: number;

  @IsObject()
  @IsOptional()
  title?: Record<string, string>;

  @IsObject()
  @IsOptional()
  description?: Record<string, string>;

  @IsArray()
  @IsOptional()
  images?: PropertyImage[];

  @IsString()
  @IsOptional()
  @MaxLength(500)
  videoUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  virtualTourUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  floorPlanUrl?: string;

  @IsArray()
  @IsOptional()
  features?: number[];

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @IsIn(['draft', 'active', 'sold', 'rented', 'archived'])
  @IsOptional()
  status?: PropertyStatus;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
