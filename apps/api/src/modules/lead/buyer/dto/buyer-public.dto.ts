import { Equals, IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PREFERRED_CONTACTS } from '@spm/shared';
import type { PreferredContact } from '@spm/shared';
import { WishlistDto } from './buyer-match.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class BuyerQuestionsQueryDto {
  @IsOptional() @Matches(/^[a-z]{2}$/)
  lang?: string;
}

// The website wishlist form. Sent as JSON in the body (never in the URL:
// the old Inmotech form put names and phones in the query string).
export class BuyerWishlistFormDto {
  @Transform(trim) @IsEmail() @MaxLength(254)
  email: string;

  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100)
  firstName: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  lastName?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(50)
  phone?: string;

  @IsOptional() @IsIn(PREFERRED_CONTACTS)
  preferredContact?: PreferredContact;

  // The language the buyer wants to be spoken to in.
  @IsOptional() @Matches(/^[a-z]{2}$/)
  language?: string;

  @IsOptional() @IsString() @MaxLength(5000)
  notes?: string;

  @ValidateNested() @Type(() => WishlistDto)
  wishlist: WishlistDto;

  // { questionKey: optionKey[] }, cleaned against the client's questions.
  @IsOptional() @IsObject()
  answers?: Record<string, unknown>;

  @IsBoolean() @Equals(true, { message: 'privacyAccepted must be true' })
  privacyAccepted: boolean;

  // The page's language, for the visitor's confirmation email.
  @IsOptional() @Matches(/^[a-z]{2}$/)
  lang?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  pageUrl?: string;

  @IsOptional() @IsString() @MaxLength(4000)
  recaptchaToken?: string;
}
