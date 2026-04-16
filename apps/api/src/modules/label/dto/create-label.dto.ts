import { IsObject, IsString, IsBoolean, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  key: string;

  @IsObject()
  translations: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  isCustom?: boolean;
}
