import { IsString, Length } from 'class-validator';

export class SetEmailDomainDto {
  // Bare validation here; the service re-normalizes + runs a stricter
  // FQDN regex, since DTO-level regexes get unwieldy for IDN etc.
  @IsString()
  @Length(4, 255)
  domain: string;
}
