import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Two-factor login codes: HOTP (RFC 4226) / TOTP (RFC 6238) with SHA-1,
// 30-second steps and 6 digits — what Google Authenticator, Microsoft
// Authenticator, 1Password and Authy expect from an otpauth:// QR code.
// Built on Node's crypto so no extra npm package. Pure.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Bad base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const bin = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totp(secret: Buffer, nowMs: number, digits = 6): string {
  return hotp(secret, Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS), digits);
}

// Accepts the current step and one either side (phone clocks drift).
export function verifyTotp(secret: Buffer, code: string, nowMs: number, window = 1): boolean {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  let ok = false;
  for (let i = -window; i <= window; i++) {
    // Check every candidate (no early exit) so timing doesn't tell which matched.
    if (timingSafeEqual(Buffer.from(hotp(secret, step + i)), Buffer.from(c))) ok = true;
  }
  return ok;
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export function otpauthUrl(issuer: string, account: string, secretB32: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

// One-time recovery codes, "abcde-fghij", from letters/digits that can't be
// misread (no 0/o, 1/l/i).
const RC = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(10);
    const s = [...bytes].map((b) => RC[b % RC.length]).join('');
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export function normaliseRecoveryCode(code: string): string {
  return String(code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
