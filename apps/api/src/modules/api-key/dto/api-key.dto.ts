import { ArrayMaxSize, IsArray, IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

// `scope` is checked field by field in cleanKeyScope (key-scope.ts): anything
// it doesn't recognise is dropped rather than rejected.
export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsObject()
  scope?: Record<string, unknown>;

  // Cleaned to bare hosts by cleanAllowedDomains.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  allowedDomains?: string[];

  // Cleaned by cleanKeySettings.
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class UpdateApiKeyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsObject()
  scope?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PreviewScopeDto {
  @IsOptional()
  @IsObject()
  scope?: Record<string, unknown>;
}

export class AiScopeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  text: string;
}
