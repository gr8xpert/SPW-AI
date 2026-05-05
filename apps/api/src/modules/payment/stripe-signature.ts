import { createHmac, timingSafeEqual } from 'crypto';

export const STRIPE_MAX_AGE_SECONDS = 300;

export type StripeVerifyResult =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'malformed' | 'expired' | 'mismatch' };

export function verifyStripeSignature(options: {
  header: string | undefined;
  rawBody: string;
  secret: string;
  now?: number;
  maxAgeSeconds?: number;
}): StripeVerifyResult {
  const { header, rawBody, secret, now = Math.floor(Date.now() / 1000) } = options;
  const maxAge = options.maxAgeSeconds ?? STRIPE_MAX_AGE_SECONDS;

  if (!header) {
    return { ok: false, reason: 'malformed' };
  }

  const parts = header.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const signaturePart = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !signaturePart) {
    return { ok: false, reason: 'malformed' };
  }

  const timestamp = parseInt(timestampPart.slice(2), 10);
  const signature = signaturePart.slice(3);

  if (isNaN(timestamp)) {
    return { ok: false, reason: 'malformed' };
  }

  if (now - timestamp > maxAge) {
    return { ok: false, reason: 'expired' };
  }

  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  if (sigBuf.length === 0 || sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'mismatch' };
  }

  return { ok: true, timestamp };
}

export function signStripePayload(
  rawBody: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const payload = `${timestamp}.${rawBody}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `t=${timestamp},v1=${sig}`;
}
