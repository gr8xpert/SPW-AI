import { createHmac, timingSafeEqual } from 'crypto';

// MailerLite's `Signature` header: hex HMAC-SHA256 of the request body as sent.
export function verifyMailerLiteSignature(header: string | undefined, rawBody: Buffer | undefined, secret: string | null | undefined): boolean {
  if (!header || !rawBody || !secret) return false;
  if (!/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const got = Buffer.from(header, 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}
