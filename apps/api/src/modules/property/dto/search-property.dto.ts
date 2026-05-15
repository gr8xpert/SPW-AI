import { IsOptional, IsNumber, IsIn, IsArray, IsBoolean, IsString, Min, Max, Matches, MaxLength } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ListingType } from '../../../database/entities/property.entity';

// Splits a CSV string of integers (locationIds=1,2,3) into number[] so the
// widget can pass list-shaped filters via the GET query string. Anything that
// isn't a finite integer is dropped silently.
const toIntArray = ({ value }: { value: unknown }): number[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parts = Array.isArray(value) ? value : String(value).split(',');
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (Number.isFinite(n)) out.push(n);
  }
  return out.length ? out : undefined;
};

export class SearchPropertyDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  locationId?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Transform(toIntArray)
  locationIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  propertyTypeId?: number;

  // Latitude/longitude/radius are used by the map view to search a circular
  // region. Bounds is a SW/NE box "swLat,swLng,neLat,neLng" used by the map's
  // rectangular drag-to-search.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(500)
  radius?: number;

  @IsOptional()
  @IsString()
  @Matches(/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/, {
    message: 'bounds must be "swLat,swLng,neLat,neLng"',
  })
  bounds?: string;

  @IsOptional()
  @IsIn(['sale', 'rent', 'holiday_rent', 'development'])
  listingType?: ListingType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  minBedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  maxBedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  minBathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(20)
  maxBathrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBuildSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxBuildSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPlotSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPlotSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTerraceSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxTerraceSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSolariumSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxSolariumSize?: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Transform(toIntArray)
  features?: number[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isFeatured?: boolean;

  // Sort values the widget emits via RsSort.tsx. PropertySearchService.applySorting
  // is the source of truth — keep this list in sync with the switch cases there.
  // Unknown values would otherwise be silently rejected (forbidNonWhitelisted)
  // and the search would 400 from the widget's perspective.
  @IsOptional()
  @IsIn([
    'create_date_desc',
    'create_date',
    'write_date_desc',
    'write_date',
    'list_price',
    'list_price_desc',
    'is_featured_desc',
    'location_id',
  ])
  sortBy?: string;

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
