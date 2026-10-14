import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RIGHTMOVE_TYPES } from '../rightmove/rightmove-catalog';

export class UpdateRightmoveSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  // Given by Rightmove for the agent. null while waiting for it.
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  @IsOptional()
  networkId?: number | null;

  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  @IsOptional()
  branchId?: number | null;

  @IsIn(['own', 'selected'])
  @IsOptional()
  mode?: 'own' | 'selected';

  @IsArray()
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  @IsOptional()
  propertyIds?: number[];

  @IsBoolean()
  @IsOptional()
  includeSpanish?: boolean;
}

export class RightmoveTypeMappingDto {
  @IsInt()
  id: number;

  // null = automatic (parent's type, else guessed from the name)
  @ValidateIf((_, v) => v !== null)
  @IsIn(RIGHTMOVE_TYPES.map((t) => t.value))
  rightmoveType: string | null;
}

export class UpdateRightmoveTypesDto {
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => RightmoveTypeMappingDto)
  types: RightmoveTypeMappingDto[];
}

export class SetRightmoveTownDto {
  @IsInt()
  locationId: number;

  // null = back to matching by name
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  rightmoveLocationId: number | null;
}
