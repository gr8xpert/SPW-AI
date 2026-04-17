import { auditEnvironment } from './boot-audit';

// Minimal safe env — every required value present, no dangerous flags.
const SAFE_PROD_ENV = {
  NODE_ENV: 'production',
  ENCRYPTION_KEY: 'a'.repeat(32),
  JWT_SECRET: 'a-real-random-secret-that-is-very-long-xxxxxx',
  JWT_REFRESH_SECRET: 'another-real-random-secret-also-quite-long-yy',
  DASHBOARD_URL: 'https://dashboard.example.com',
};

describe('auditEnvironment', () => {
  it('returns no problems for a safe production env', () => {
    const { problems, warnings } = auditEnvironment(SAFE_PROD_ENV as any);
    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('flags a missing ENCRYPTION_KEY', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      ENCRYPTION_KEY: undefined,
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('ENCRYPTION_KEY missing'),
    );
  });

  it('flags the .env.example ENCRYPTION_KEY placeholder', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      ENCRYPTION_KEY: '32-character-encryption-key-here',
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('ENCRYPTION_KEY looks like a placeholder'),
    );
  });

  it('flags WEBHOOK_ALLOW_LOOPBACK=true in production', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      WEBHOOK_ALLOW_LOOPBACK: 'true',
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('WEBHOOK_ALLOW_LOOPBACK'),
    );
  });

  it('flags DATABASE_SYNCHRONIZE=true in production', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      DATABASE_SYNCHRONIZE: 'true',
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('DATABASE_SYNCHRONIZE'),
    );
  });

  it('warns (does not fail) on DATABASE_LOGGING=true in production', () => {
    const { problems, warnings } = auditEnvironment({
      ...SAFE_PROD_ENV,
      DATABASE_LOGGING: 'true',
    } as any);
    expect(problems).toEqual([]);
    expect(warnings).toContainEqual(
      expect.stringContaining('DATABASE_LOGGING'),
    );
  });

  it('flags a missing DASHBOARD_URL in production', () => {
    const { DASHBOARD_URL, ...rest } = SAFE_PROD_ENV;
    const { problems } = auditEnvironment(rest as any);
    expect(problems).toContainEqual(expect.stringContaining('DASHBOARD_URL'));
  });

  it('flags JWT_SECRET that looks like a placeholder', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      JWT_SECRET: 'your-jwt-secret-example-value-here-xxxxx',
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('JWT_SECRET looks like a placeholder'),
    );
  });

  it('tolerates dev-style env without problems', () => {
    const { problems } = auditEnvironment({
      NODE_ENV: 'development',
      ENCRYPTION_KEY: 'a'.repeat(32),
      // No JWT / DASHBOARD_URL — that's fine outside production.
    } as any);
    expect(problems).toEqual([]);
  });
});
