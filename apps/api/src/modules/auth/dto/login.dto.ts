import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  // Two-factor code (6 digits) or a recovery code, sent on the second try
  // after the API answered TWO_FACTOR_REQUIRED.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;
}

export class LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  // Returned only on /register (shown to the tenant owner once). Omitted on
  // /login and /refresh since we no longer store the raw key.
  tenantApiKey?: string;
  // True on /register — the initial session works, but logging back in from
  // a new device requires clicking the verification link first.
  emailVerificationRequired?: boolean;
  user: {
    id: number;
    email: string;
    name: string | null;
    role: string;
    tenantId: number;
    // The agency requires two-factor login and this user must set it up first.
    mfaSetup?: boolean;
  };
}
