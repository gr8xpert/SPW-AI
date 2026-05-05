import { createHash, randomBytes } from 'crypto';

// Tenant API keys live in x-api-key headers on public endpoints. We store
// only their sha256 — the raw value is visible once at generation and must
// be rotated if lost. `spm_` prefix is retained purely so key leaks are
// grep-able in logs and source control scanning.
const API_KEY_PREFIX = 'spm_';

export interface GeneratedApiKey {
  rawKey: string; // 'spm_<64 hex>' — shown to the caller exactly once
  hash: string; // sha256 hex — what the DB stores
  last4: string; // last 4 chars of rawKey — UI hint only
}

export function generateApiKey(): GeneratedApiKey {
  const rawKey = `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  return {
    rawKey,
    hash: hashApiKey(rawKey),
    last4: rawKey.slice(-4),
  };
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}
