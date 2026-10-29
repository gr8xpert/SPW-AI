import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

// Field names are snake_case: they are the WordPress plugin's wire format (docs/licensing-api.md).
export class PluginLicenseRequestDto {
  @IsString()
  @MaxLength(60)
  license_key: string;

  @IsString()
  @MaxLength(255)
  site_url: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  plugin_version?: string;
}

export class PluginTranslateDto extends PluginLicenseRequestDto {
  // Translator instructions plus the site's glossary; capped so it stays overhead, not a payload.
  @IsString()
  @MaxLength(16_000)
  system: string;

  // JSON string {"items":[{"id","text"}]}; batches are capped by the plugin (~8,000 source characters).
  @IsString()
  @MaxLength(200_000)
  user: string;

  // Accepted for compatibility and ignored: the server uses its own fixed translations schema.
  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;
}
