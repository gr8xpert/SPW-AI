import { createHmac, timingSafeEqual } from 'crypto';

// 6A — Paddle Billing v2 webhook signature verification.
//
// Paddle sends a `Paddle-Signature` header in the format:
//   ts=<unix_seconds>;h1=<hex-hmac-sha256>
// The signed payload is the literal string `<ts>:<raw_body>` — so any JSON
// re-serialization would invalidate the signature. The webhook controller
// captures req.rawBody via NestFactory({ rawBody: true }) to preserve it.
//
// Replay protection: we reject timestamps more than MAX_AGE_SECONDS old.
// Paddle retries failed deliveries, but retries re-sign with a fresh
// timestamp, so the window doesn't need to accommodate those — we only
// need enough slack for clock skew and slow networks.
//
// Reference: https://developer.paddle.com/webhooks/signature-verification

export const PADDLE_MAX_AGE_SECONDS = 300; // 5 minutes

export type PaddleVerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'malformed' | 'expired' | 'mismatch' };

export function parsePaddleSignature(
  header: string | undefined,
): { ts: number; h1: string } | null {
  if (!header) return null;
  const parts: Record<string, string> = {};
  for (const segment of header.split(';')) {
    const eq = segment.indexOf('=');
    if (eq < 0) continue;
    const key = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (!key) continue;
    parts[key] = value;
  }
  const tsRaw = parts.ts;
  const h1 = parts.h1;
  if (!tsRaw || !h1) return null;
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || ts <= 0) return null;
  // `h1` must be hex of a reasonable length; SHA-256 → 64 hex chars. We
  // don't hard-require 64 here so a future algorithm upgrade doesn't wedge
  // us, but anything non-hex is rejected.
  if (!/^[a-f0-9]+$/i.test(h1)) return null;
  return { ts, h1: h1.toLowerCase() };
}

export function verifyPaddleSignature(options: {
  header: string | undefined;
  rawBody: string;
  secret: string;
  now?: number;
  maxAgeSeconds?: number;
}): PaddleVerifyResult {
  const { header, rawBody, secret } = options;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const maxAge = options.maxAgeSeconds ?? PADDLE_MAX_AGE_SECONDS;

  const parsed = parsePaddleSignature(header);
  if (!parsed) return { ok: false, reason: 'malformed' };

  if (Math.abs(now - parsed.ts) > maxAge) {
    return { ok: false, reason: 'expired' };
  }

  const expectedHex = createHmac('sha256', secret)
    .update(`${parsed.ts}:${rawBody}`)
    .digest('hex');

  // Buffers must be the same length for timingSafeEqual. If the provided h1
  // doesn't match our digest width the signature can't possibly match, so
  // report mismatch without doing the compare.
  if (expectedHex.length !== parsed.h1.length) {
    return { ok: false, reason: 'mismatch' };
  }
  const ok = timingSafeEqual(
    Buffer.from(expectedHex, 'hex'),
    Buffer.from(parsed.h1, 'hex'),
  );
  return ok
    ? { ok: true, timestamp: parsed.ts }
    : { ok: false, reason: 'mismatch' };
}

// Test helper — produces the signed header format Paddle would send.
// Not used in production code; exported so the smoke test can replay the
// exact encoding the controller expects without duplicating the recipe.
export function signPaddlePayload(
  rawBody: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const h1 = createHmac('sha256', secret)
    .update(`${timestamp}:${rawBody}`)
    .digest('hex');
  return `ts=${timestamp};h1=${h1}`;
}
