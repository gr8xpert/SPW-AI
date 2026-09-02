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

  @IsIn(['sale', 'rent', 'holiday_rent', 'development'])
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

  @IsNumber()
  @IsOptional()
  priceTo?: number;

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
  bedroomsTo?: number;

  @IsNumber()
  @IsOptional()
  bathrooms?: number;

  @IsNumber()
  @IsOptional()
  bathroomsTo?: number;

  @IsNumber()
  @IsOptional()
  buildSize?: number;

  @IsNumber()
  @IsOptional()
  buildSizeTo?: number;

  @IsNumber()
  @IsOptional()
  plotSize?: number;

  @IsNumber()
  @IsOptional()
  plotSizeTo?: number;

  @IsNumber()
  @IsOptional()
  terraceSize?: number;

  @IsNumber()
  @IsOptional()
  terraceSizeTo?: number;

  @IsNumber()
  @IsOptional()
  gardenSize?: number;

  @IsNumber()
  @IsOptional()
  solariumSize?: number;

  // Address
  @IsString()
  @IsOptional()
  @MaxLength(50)
  floor?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  street?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  streetNumber?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  postcode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  cadastralReference?: string;

  // Financial / Tax
  @IsNumber()
  @IsOptional()
  communityFees?: number;

  @IsNumber()
  @IsOptional()
  basuraTax?: number;

  @IsNumber()
  @IsOptional()
  ibiFees?: number;

  @IsNumber()
  @IsOptional()
  commission?: number;

  @IsBoolean()
  @IsOptional()
  sharedCommission?: boolean;

  // Building / Energy
  @IsNumber()
  @IsOptional()
  builtYear?: number;

  @IsNumber()
  @IsOptional()
  energyConsumption?: number;

  @IsString()
  @IsOptional()
  @MaxLength(2)
  energyRating?: string;

  // Distance
  @IsNumber()
  @IsOptional()
  distanceToBeach?: number;

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

  // Multi-floor-plan array. When present, property.service mirrors
  // floorPlans[0].url into floorPlanUrl so legacy readers keep working.
  @IsArray()
  @IsOptional()
  floorPlans?: Array<{ url: string; label?: string }>;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  externalLink?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  blogUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  mapLink?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  websiteUrl?: string;

  @IsArray()
  @IsOptional()
  features?: number[];

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  geoLocationLabel?: string;

  // SEO
  @IsString()
  @IsOptional()
  @MaxLength(255)
  slug?: string;

  @IsObject()
  @IsOptional()
  metaTitle?: Record<string, string>;

  @IsObject()
  @IsOptional()
  metaDescription?: Record<string, string>;

  @IsObject()
  @IsOptional()
  metaKeywords?: Record<string, string>;

  @IsObject()
  @IsOptional()
  pageTitle?: Record<string, string>;

  // Custom JSON-LD schema (schema.org). When set, widget uses this instead
  // of the auto-generated RealEstateListing block. Stored as raw string so
  // the caller controls formatting; validated to be either null/empty or
  // parseable JSON at the service layer.
  @IsString()
  @IsOptional()
  seoSchemaJson?: string | null;

  // Agent / Assignment
  @IsNumber()
  @IsOptional()
  agentId?: number;

  @IsNumber()
  @IsOptional()
  salesAgentId?: number;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  project?: string;

  // Selection flags
  @IsBoolean()
  @IsOptional()
  isOwnProperty?: boolean;

  @IsBoolean()
  @IsOptional()
  villaSelection?: boolean;

  @IsBoolean()
  @IsOptional()
  luxurySelection?: boolean;

  @IsBoolean()
  @IsOptional()
  apartmentSelection?: boolean;

  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @IsDateString()
  @IsOptional()
  completionDate?: string;

  @IsDateString()
  @IsOptional()
  lastUpdatedResales?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  propertyTypeReference?: string;

  @IsIn(['draft', 'active', 'sold', 'rented', 'archived'])
  @IsOptional()
  status?: PropertyStatus;

  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;

  @IsIn(['inherit', 'branded', 'unbranded'])
  @IsOptional()
  brochureVariant?: 'inherit' | 'branded' | 'unbranded';
}
