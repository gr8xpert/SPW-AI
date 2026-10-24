import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { WHATSAPP_KINDS, type WhatsAppKind } from '../whatsapp/whatsapp-text';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// One WhatsApp message (preview or open). What it is about depends on kind:
// propertyIds (properties), viewingId (viewing), taskId (follow_up); an
// enquiry reply reads the lead's latest website form.
export class WhatsAppDto {
  @IsIn(WHATSAPP_KINDS)
  kind: WhatsAppKind;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @Type(() => Number) @IsInt({ each: true })
  propertyIds?: number[];

  @IsOptional() @Type(() => Number) @IsInt()
  viewingId?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  taskId?: number;

  @IsOptional() @Matches(/^[a-z]{2}$/)
  lang?: string;

  // The agent's own text; without it the label template is used.
  @IsOptional() @Transform(trim) @IsString() @MaxLength(3000)
  message?: string;

  @IsOptional() @IsBoolean()
  allowResend?: boolean;

  // Another number than the contact's own (typed in the dialog).
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40)
  phone?: string;

  @IsOptional() @IsBoolean()
  markTaskDone?: boolean;

  @IsOptional() @IsBoolean()
  markHandled?: boolean;
}
