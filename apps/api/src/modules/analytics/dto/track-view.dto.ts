import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsBoolean } from 'class-validator';

export class TrackViewDto {
  @IsInt()
  propertyId: number;

  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsOptional()
  referrer?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  duration?: number;
}

export class TrackSearchDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsOptional()
  filters?: Record<string, any>;

  @IsInt()
  @Min(0)
  @IsOptional()
  resultsCount?: number;

  @IsInt()
  @IsOptional()
  clickedPropertyId?: number;
}

export class TrackInquiryDto {
  @IsInt()
  propertyId: number;

  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsBoolean()
  @IsOptional()
  inquiryMade?: boolean;
}
