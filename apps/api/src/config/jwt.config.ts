import { registerAs } from '@nestjs/config';

function requireSecret(name: string, value: string | undefined): string {
  if (!value || value.trim().length < 32) {
    throw new Error(
      `Environment variable ${name} must be set to a random string of at least 32 characters. ` +
        `Generate one with: openssl rand -base64 48`,
    );
  }
  return value;
}

export const jwtConfig = registerAs('jwt', () => ({
  secret: requireSecret('JWT_SECRET', process.env.JWT_SECRET),
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  refreshSecret: requireSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET),
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
}));
