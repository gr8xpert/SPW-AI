import { Logger } from '@nestjs/common';

// Boot-time security audit. Catches the #1 cause of "deployed API is crashing"
// incidents: operator forgot to replace a placeholder env, or left a dev-only
// flag enabled in production. Runs in main.ts before we listen, so a
// mis-configured deploy crashes loudly instead of silently running with
// insecure defaults.
//
// Non-production: log warnings but continue (local dev shouldn't be blocked
// by audit-level nitpicks). Production: any problem throws so the container
// fails its healthcheck and the orchestrator surfaces the error.

const logger = new Logger('BootAudit');

// Obvious placeholder values that must never land in a prod .env. The
// `.env.example` literal for ENCRYPTION_KEY is included verbatim because
// operators sometimes copy .env.example -> .env and only fill in half.
const KNOWN_PLACEHOLDERS = new Set([
  'changeme',
  'change-me',
  'change_me',
  'secret',
  'password',
  'development',
  'development-secret',
  'dev-secret',
  'test',
  'test-secret',
  '32-character-encryption-key-here',
]);

// Heuristic: values containing any of these substrings are almost certainly
// not real production secrets.
const SUSPICIOUS_SUBSTRINGS = ['example', 'changeme', 'placeholder', 'todo'];

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim().toLowerCase();
  if (KNOWN_PLACEHOLDERS.has(trimmed)) return true;
  if (trimmed.startsWith('your-') || trimmed.startsWith('replace-')) return true;
  for (const needle of SUSPICIOUS_SUBSTRINGS) {
    if (trimmed.includes(needle)) return true;
  }
  return false;
}

export interface BootAuditResult {
  problems: string[];
  warnings: string[];
  isProduction: boolean;
}

// Pure function so it's trivially unit-testable. `runBootSecurityAudit()`
// below is the side-effecting boot entry point that logs + throws.
export function auditEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): BootAuditResult {
  const isProduction = env.NODE_ENV === 'production';
  const problems: string[] = [];
  const warnings: string[] = [];

  // ENCRYPTION_KEY is required by the secret-cipher transformer. Its length
  // check is duplicated here so we fail at boot instead of on the first
  // encrypted column read, which could be an unrelated path away from the
  // error's root cause.
  const encKey = env.ENCRYPTION_KEY;
  if (!encKey || encKey.length < 16) {
    problems.push('ENCRYPTION_KEY missing or < 16 chars');
  } else if (isProduction && looksLikePlaceholder(encKey)) {
    problems.push(
      'ENCRYPTION_KEY looks like a placeholder/example value — generate a real 32-char key',
    );
  }

  // JWT secrets: length already enforced by jwt.config.ts (>= 32 chars), but
  // the string "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" also passes that — reject
  // known-placeholder tokens explicitly.
  if (isProduction && looksLikePlaceholder(env.JWT_SECRET)) {
    problems.push('JWT_SECRET looks like a placeholder/example value');
  }
  if (isProduction && looksLikePlaceholder(env.JWT_REFRESH_SECRET)) {
    problems.push('JWT_REFRESH_SECRET looks like a placeholder/example value');
  }

  // Stripe inbound webhook secret. Empty is treated as "Stripe disabled".
  // A placeholder is a strong signal someone copied .env.production.example
  // without filling the real value.
  if (isProduction && env.STRIPE_WEBHOOK_SECRET) {
    if (looksLikePlaceholder(env.STRIPE_WEBHOOK_SECRET)) {
      problems.push(
        'STRIPE_WEBHOOK_SECRET looks like a placeholder/example value',
      );
    }
  }

  // Stripe outbound API key. Symmetric check to the inbound secret. A
  // placeholder value here means checkout calls will 401 from Stripe the
  // first time a tenant clicks Upgrade. Additionally, inbound-set +
  // outbound-missing is a half-config (webhooks work but the dashboard
  // can't start a checkout) — warn so the operator finishes the loop.
  if (isProduction && env.STRIPE_SECRET_KEY) {
    if (looksLikePlaceholder(env.STRIPE_SECRET_KEY)) {
      problems.push('STRIPE_SECRET_KEY looks like a placeholder/example value');
    }
  }
  if (
    isProduction &&
    env.STRIPE_WEBHOOK_SECRET &&
    !looksLikePlaceholder(env.STRIPE_WEBHOOK_SECRET) &&
    !env.STRIPE_SECRET_KEY
  ) {
    warnings.push(
      'STRIPE_WEBHOOK_SECRET is set but STRIPE_SECRET_KEY is not — tenants cannot start a Stripe checkout',
    );
  }

  // 6D — operator DKIM private key sanity. Signing with a junk PEM is
  // worse than not signing: every receiver hard-fails the signature and
  // our mail reputation tanks. Require either all three MAIL_DKIM_* vars
  // together, or none at all.
  if (isProduction) {
    const hasDomain = !!env.MAIL_DKIM_DOMAIN;
    const hasSelector = !!env.MAIL_DKIM_SELECTOR;
    const hasKey = !!env.MAIL_DKIM_PRIVATE_KEY;
    const someSet = hasDomain || hasSelector || hasKey;
    const allSet = hasDomain && hasSelector && hasKey;
    if (someSet && !allSet) {
      problems.push(
        'MAIL_DKIM_* partially configured — set DOMAIN, SELECTOR, and PRIVATE_KEY together or leave all three empty',
      );
    }
    if (hasKey) {
      // Tolerant check: after unescaping \n back to real newlines, the
      // value should look like a PEM. Catches "your-private-key-here"
      // placeholders and stray strings that couldn't possibly decode.
      const keyText = (env.MAIL_DKIM_PRIVATE_KEY || '').replace(/\\n/g, '\n');
      const looksPem =
        keyText.includes('BEGIN') && keyText.includes('PRIVATE KEY');
      if (!looksPem || looksLikePlaceholder(env.MAIL_DKIM_PRIVATE_KEY)) {
        problems.push(
          'MAIL_DKIM_PRIVATE_KEY does not look like a real PEM private key',
        );
      }
    }
  }

  // Production-only invariants. These are either dev conveniences that are
  // outright dangerous in prod (WEBHOOK_ALLOW_LOOPBACK opens SSRF) or
  // TypeORM flags that silently reshape the schema.
  if (isProduction) {
    if (env.WEBHOOK_ALLOW_LOOPBACK === 'true') {
      problems.push(
        'WEBHOOK_ALLOW_LOOPBACK=true is unsafe in production (lets tenants target 127.0.0.1 / private IPs via webhooks)',
      );
    }
    if (env.DATABASE_SYNCHRONIZE === 'true') {
      problems.push(
        'DATABASE_SYNCHRONIZE=true is unsafe in production (TypeORM will auto-alter live tables)',
      );
    }
    if (env.DATABASE_LOGGING === 'true') {
      warnings.push(
        'DATABASE_LOGGING=true will flood production logs with every SQL query',
      );
    }
    if (!env.DASHBOARD_URL) {
      problems.push(
        'DASHBOARD_URL must be set in production (used for CORS allowlist + verification email links)',
      );
    }
  }

  return { problems, warnings, isProduction };
}

export function runBootSecurityAudit(env: NodeJS.ProcessEnv = process.env): void {
  const { problems, warnings, isProduction } = auditEnvironment(env);

  for (const w of warnings) {
    logger.warn(w);
  }

  if (problems.length === 0) {
    logger.log(
      `boot security audit: OK (NODE_ENV=${env.NODE_ENV || 'development'})`,
    );
    return;
  }

  for (const p of problems) {
    logger.error(`boot audit: ${p}`);
  }

  if (isProduction) {
    throw new Error(
      `Refusing to boot: ${problems.length} production security audit problem(s):\n  - ${problems.join(
        '\n  - ',
      )}\nFix the listed issues in your environment before starting.`,
    );
  }

  logger.warn(
    `${problems.length} audit problem(s) ignored outside production — fix before deploying`,
  );
}
