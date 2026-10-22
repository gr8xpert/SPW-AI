import { Allow, ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { RULE_NUMBER_FIELDS } from '@spm/shared';
import { MAX_RULES } from '../ai/note-rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Most a pasted message may be; what reaches the model is cut shorter.
export const MAX_PASTE = 6000;

export class AiPasteDto {
  @Transform(trim)
  @IsString()
  @Length(3, MAX_PASTE)
  text: string;
}

// One rule as the dashboard sends it back. Checked again by cleanRules
// against the agency's lists; this only keeps the shape.
export class NoteRuleDto {
  @IsOptional() @IsString() @MaxLength(80)
  id?: string;

  @IsIn(['floor', 'feature', 'type', 'place', 'max', 'min'])
  kind: string;

  @IsOptional() @IsIn(['avoid', 'require'])
  mode?: string;

  // 'ground' | 'top' for floor rules, a number for max / min.
  @Allow()
  value?: unknown;

  @IsOptional() @IsInt()
  featureId?: number;

  @IsOptional() @IsInt()
  propertyTypeId?: number;

  @IsOptional() @IsInt()
  locationId?: number;

  @IsOptional() @IsIn(RULE_NUMBER_FIELDS)
  field?: string;

  @Transform(trim) @IsString() @Length(1, 300)
  text: string;

  @IsOptional() @IsIn(['hard', 'soft'])
  strength?: string;
}

export class SaveRulesDto {
  @IsArray()
  @ArrayMaxSize(MAX_RULES)
  @ValidateNested({ each: true })
  @Type(() => NoteRuleDto)
  rules: NoteRuleDto[];

  // The notes the rules were read from (from POST …/ai/rules): marks them
  // as read. Left out when only a rule was added or removed.
  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/)
  notesHash?: string;
}

export class AiEmailIntroDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @Type(() => Number)
  @IsInt({ each: true })
  propertyIds: number[];

  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  lang?: string;
}

export class AiSummaryDto {
  // Write a new summary even when nothing changed.
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class AiDismissDto {
  // feature:<id> or rule:<rule key>
  @Matches(/^(feature:\d{1,10}|rule:[a-zA-Z]+(:[a-zA-Z0-9_]+){1,3})$/)
  @MaxLength(60)
  key: string;
}
