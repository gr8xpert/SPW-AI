import { IsOptional, IsString, MaxLength } from 'class-validator';

// Null clears the configured URL. Empty string is coerced to null server-side
// so the dashboard doesn't have to distinguish the two when the user wipes
// the input.
export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhookUrl?: string | null;
}
