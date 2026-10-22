import { createHmac, timingSafeEqual } from 'crypto';

// Signed ids for the links in buyer emails: the open pixel ('o'), each
// property link ('c') and the unsubscribe link ('u', signs the buyer id). The token holds only the send id (and property id),
// never an email or a name, and the purpose is signed with it, so an open
// token can't be used as a click.
//
//   token = base64url("<sendId>" | "<sendId>.<propertyId>") + "." + mac
//   mac   = base64url(HMAC-SHA256(key, purpose + ":" + payload)), first 22 chars (128 bits)

export type LinkPurpose = 'o' | 'c' | 'u';

const MAC_LENGTH = 22;
const MAX_ID = 2 ** 31 - 1;

// BUYER_LINK_SECRET when set; else a key derived from JWT_SECRET (never the
// JWT secret itself, so a leaked link key can't sign logins).
export function linkSecret(env: Record<string, string | undefined> = process.env): Buffer {
  if (env.BUYER_LINK_SECRET) return Buffer.from(env.BUYER_LINK_SECRET);
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return createHmac('sha256', env.JWT_SECRET).update('spm-buyer-link-v1').digest();
}

function validId(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= MAX_ID;
}

function mac(key: Buffer, purpose: LinkPurpose, payload: string): string {
  return createHmac('sha256', key).update(`${purpose}:${payload}`).digest('base64url').slice(0, MAC_LENGTH);
}

export function signLinkToken(key: Buffer, purpose: LinkPurpose, sendId: number, propertyId?: number): string {
  if (!validId(sendId) || (propertyId !== undefined && !validId(propertyId))) throw new Error('Bad link token id');
  const payload = Buffer.from(propertyId !== undefined ? `${sendId}.${propertyId}` : String(sendId)).toString('base64url');
  return `${payload}.${mac(key, purpose, payload)}`;
}

export function verifyLinkToken(key: Buffer, purpose: LinkPurpose, token: string): { sendId: number; propertyId?: number } | null {
  if (typeof token !== 'string' || token.length > 100) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, given] = parts;
  if (!payload || given.length !== MAC_LENGTH) return null;
  const expected = mac(key, purpose, payload);
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  const m = /^(\d{1,10})(?:\.(\d{1,10}))?$/.exec(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!m) return null;
  const sendId = Number(m[1]);
  const propertyId = m[2] !== undefined ? Number(m[2]) : undefined;
  if (!validId(sendId) || (propertyId !== undefined && !validId(propertyId))) return null;
  return propertyId !== undefined ? { sendId, propertyId } : { sendId };
}
