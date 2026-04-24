import { IsString, IsOptional, IsNumber, IsArray, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
  currentFilters?: Record<string, any>;

  @IsOptional()
  @IsString()
  language?: string;
}

export class CreateChatMessageDto {
  @IsOptional()
  @IsNumber()
  conversationId?: number;

  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ChatContextDto)
  context?: ChatContextDto;
}
