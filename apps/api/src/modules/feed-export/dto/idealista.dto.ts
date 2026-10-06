import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IDEALISTA_TYPES } from '../idealista/idealista-catalog';

export class UpdateIdealistaSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  // Empty while the agency is still waiting for it from idealista.
  @IsString()
  @Matches(/^$|^ilc[a-z0-9]{40}$/, { message: 'customerCode must be "ilc" followed by 40 lowercase letters/digits' })
  @IsOptional()
  customerCode?: string;

  @IsIn(['Spain', 'Portugal', 'Italy'])
  @IsOptional()
  country?: 'Spain' | 'Portugal' | 'Italy';

  @IsString()
  @MaxLength(60)
  @IsOptional()
  contactName?: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @MaxLength(30)
  @IsOptional()
  contactPhone?: string;

  @IsIn(['full', 'street', 'hidden'])
  @IsOptional()
  addressVisibility?: 'full' | 'street' | 'hidden';

  @IsIn(['own', 'selected'])
  @IsOptional()
  mode?: 'own' | 'selected';

  @IsArray()
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  @IsOptional()
  propertyIds?: number[];

  @IsString()
  @MaxLength(300)
  @Matches(/^$|^https?:\/\/\S+$/, { message: 'propertyUrlPattern must be an http(s) URL' })
  @IsOptional()
  propertyUrlPattern?: string;
}

export class IdealistaTypeMappingDto {
  @IsInt()
  id: number;

  // null = automatic (parent's type, else guessed from the name)
  @ValidateIf((_, v) => v !== null)
  @IsIn(IDEALISTA_TYPES.map((t) => t.value))
  idealistaType: string | null;
}

export class UpdateIdealistaTypesDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => IdealistaTypeMappingDto)
  types: IdealistaTypeMappingDto[];
}
