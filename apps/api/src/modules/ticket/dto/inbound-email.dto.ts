import { IsString, IsOptional, IsEmail } from 'class-validator';

// Payload posted by n8n / Postmark / Mailgun after parsing an inbound email
// destined for the tickets mailbox. Only `to`, `from`, and one of text/html
// are required — everything else helps threading but isn't load-bearing.
export class InboundEmailDto {
  @IsString()
  to: string;

  @IsEmail()
  from: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  html?: string;

  @IsString()
  @IsOptional()
  messageId?: string;

  @IsString()
  @IsOptional()
  inReplyTo?: string;
}
