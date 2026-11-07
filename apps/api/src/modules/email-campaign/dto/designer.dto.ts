import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class RenderPreviewDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  subject?: string;

  @IsString()
  @MaxLength(300_000)
  bodyHtml: string;
}

export class DesignDirectionsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/\S/, { message: 'brief must not be empty' })
  brief: string;
}

export class BrandLogoImageDto {
  @IsInt()
  @Min(1)
  imageId: number;
}

export class DesignerMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  @Matches(/\S/, { message: 'message must not be empty' })
  message: string;

  // Checked against this client's own image library in the service (any
  // scheme, so local http:// uploads work), not by URL shape here.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  imageUrls?: string[];
}

export class BrandMemoryDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  notes: string[];
}
