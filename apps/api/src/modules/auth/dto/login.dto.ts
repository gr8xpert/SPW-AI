import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
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
  };
}
