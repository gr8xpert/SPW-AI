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

  it('flags PADDLE_WEBHOOK_SECRET that looks like a placeholder (6A)', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      PADDLE_WEBHOOK_SECRET: 'your-paddle-webhook-secret-goes-here',
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('PADDLE_WEBHOOK_SECRET'),
    );
  });

  it('allows a real-looking PADDLE_WEBHOOK_SECRET in production (6A)', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_01h9ae4c1bcb67e43a0df0b2',
    } as any);
    expect(problems).toEqual([]);
  });

  it('flags PADDLE_API_KEY that looks like a placeholder (6E)', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      PADDLE_API_KEY: 'your-paddle-api-key-here',
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('PADDLE_API_KEY'),
    );
  });

  it('allows a real-looking PADDLE_API_KEY in production (6E)', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      PADDLE_API_KEY: 'pdl_live_apikey_01h9ae4c1bcb67e43a0df0b2',
    } as any);
    expect(problems).toEqual([]);
  });

  it('warns when PADDLE_WEBHOOK_SECRET is set but PADDLE_API_KEY is missing (6E)', () => {
    const { problems, warnings } = auditEnvironment({
      ...SAFE_PROD_ENV,
      PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_01h9ae4c1bcb67e43a0df0b2',
      // PADDLE_API_KEY intentionally omitted
    } as any);
    expect(problems).toEqual([]);
    expect(warnings).toContainEqual(
      expect.stringContaining('PADDLE_API_KEY'),
    );
  });

  it('flags partial MAIL_DKIM_* configuration (6D)', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      MAIL_DKIM_DOMAIN: 'mail.example.com',
      MAIL_DKIM_SELECTOR: 'spm1',
      // Missing MAIL_DKIM_PRIVATE_KEY → partial config
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('MAIL_DKIM_* partially configured'),
    );
  });

  it('flags a non-PEM MAIL_DKIM_PRIVATE_KEY (6D)', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      MAIL_DKIM_DOMAIN: 'mail.example.com',
      MAIL_DKIM_SELECTOR: 'spm1',
      MAIL_DKIM_PRIVATE_KEY: 'your-private-key-here',
    } as any);
    expect(problems).toContainEqual(
      expect.stringContaining('MAIL_DKIM_PRIVATE_KEY does not look like'),
    );
  });

  it('allows a real-looking MAIL_DKIM_PRIVATE_KEY with all three vars (6D)', () => {
    const { problems } = auditEnvironment({
      ...SAFE_PROD_ENV,
      MAIL_DKIM_DOMAIN: 'mail.example.com',
      MAIL_DKIM_SELECTOR: 'spm1',
      MAIL_DKIM_PRIVATE_KEY:
        '-----BEGIN PRIVATE KEY-----\\nMIIE...snip...==\\n-----END PRIVATE KEY-----',
    } as any);
    expect(problems).toEqual([]);
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
