import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// The two forms on a client's website. Real classes, not `CreateLeadDto &
// {…}` or an inline type: those reach the ValidationPipe as plain Object and
// were never validated (2026-10-06: the wishlist form sent fields the API
// didn't read and every share failed with a 500).

/** Property page "Request information" form. */
export class InquiryDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsInt()
  propertyId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  propertyReference?: string;

  /** The page the visitor sent it from, for the link in the agency's email. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  recaptchaToken?: string;

  /** The visit's analytics session, so the inquiry counts on its property view. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sessionId?: string;
}

export class ShareItemDto {
  @IsInt()
  id: number;

  /** Path of the property's page on the client's site, e.g. /property/villa_R123. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  path?: string;
}

/** Wishlist "Email your wishlist" form. */
export class ShareFavoritesDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  recaptchaToken?: string;

  @IsEmail()
  @MaxLength(254)
  recipientEmail: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  senderEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  senderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShareItemDto)
  items: ShareItemDto[];

  // Sent by widgets built before 2026-10-06; ignored.
  @IsOptional()
  @IsIn(['email'])
  type?: string;
}
