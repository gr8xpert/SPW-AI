import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Translated names ({ en: 'Viewing', es: 'Visita' }) are plain objects;
// their keys and values are checked in the service (cleanTranslations).

export class CreateStageDto {
  @IsObject()
  name: Record<string, string>;

  @IsOptional() @Matches(/^#[0-9a-f]{6}$/i)
  color?: string;

  @IsOptional() @IsIn(['open', 'won', 'lost'])
  kind?: 'open' | 'won' | 'lost';
}

export class UpdateStageDto {
  @IsOptional() @IsObject()
  name?: Record<string, string>;

  @IsOptional() @Matches(/^#[0-9a-f]{6}$/i)
  color?: string;

  @IsOptional() @IsIn(['open', 'won', 'lost'])
  kind?: 'open' | 'won' | 'lost';

  // Chance (%) a buyer here buys; null = automatic (milestone J).
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() @Min(0) @Max(100)
  probability?: number | null;
}

export class ReorderDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @Type(() => Number) @IsInt({ each: true })
  ids: number[];
}

export class QuestionOptionDto {
  // Present for an existing option (keeps answers pointing at it).
  @IsOptional() @Matches(/^[a-z0-9_]{1,60}$/)
  key?: string;

  @IsObject()
  label: Record<string, string>;
}

export class CreateQuestionDto {
  @IsObject()
  label: Record<string, string>;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => QuestionOptionDto)
  options: QuestionOptionDto[];

  @IsOptional() @IsBoolean()
  multiple?: boolean;

  @IsOptional() @IsBoolean()
  showOnForm?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateQuestionDto {
  @IsOptional() @IsObject()
  label?: Record<string, string>;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @IsOptional() @IsBoolean()
  multiple?: boolean;

  @IsOptional() @IsBoolean()
  showOnForm?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class SetAnswersDto {
  @IsObject()
  answers: Record<string, string[]>;
}

export class CreateTaskDto {
  @Transform(trim) @IsString() @Length(1, 255)
  title: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000)
  notes?: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  dueAt?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt()
  assignedTo?: number | null;
}

export class UpdateTaskDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 255)
  title?: string;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(5000)
  notes?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  dueAt?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt()
  assignedTo?: number | null;

  @IsOptional() @IsBoolean()
  done?: boolean;
}

export class DueTasksDto {
  // End of the viewer's local day; tasks due before it are listed.
  @IsDateString()
  before: string;

  @IsOptional() @Type(() => Number) @IsInt()
  agentId?: number;
}
