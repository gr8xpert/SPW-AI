import { Equals, IsBoolean, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ConnectMailerLiteDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  @Matches(/^\s*\S+\s*$/, { message: 'That does not look like a MailerLite API key' })
  apiKey: string;
}

export class ConfirmConsentDto {
  @IsBoolean()
  @Equals(true, { message: 'Please tick the box to confirm' })
  confirmed: boolean;
}
