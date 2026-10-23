import { IsString, IsOptional, IsNumber, IsArray, IsObject, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ChatFiltersDto {
  @IsOptional()
  @IsString()
  listingType?: string;

  @IsOptional()
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @IsNumber()
  minBedrooms?: number;

  @IsOptional()
  @IsNumber()
  maxBedrooms?: number;

  @IsOptional()
  @IsNumber()
  locationId?: number;

  @IsOptional()
  @IsNumber()
  propertyTypeId?: number;

  @IsOptional()
  @IsString()
  query?: string;
}

class ChatContextDto {
  @IsOptional()
  @IsString()
  propertyReference?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  favorites?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recentlyViewed?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatFiltersDto)
  currentFilters?: ChatFiltersDto;

  @IsOptional()
  @IsString()
  language?: string;
}

export class CreateChatMessageDto {
  @IsOptional()
  @IsNumber()
  conversationId?: number;

  // The secret the 'conversation' event handed out; without it a new chat starts.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  conversationToken?: string;

  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextDto)
  context?: ChatContextDto;
}
