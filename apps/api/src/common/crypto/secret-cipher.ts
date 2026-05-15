import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { ValueTransformer } from 'typeorm';

// AES-256-GCM at-rest encryption for small secrets (API credentials, tokens).
// The derived key comes from env ENCRYPTION_KEY — SHA-256 of the raw env value
// gives us a deterministic 32-byte key regardless of how the secret is formatted.
//
// Ciphertext layout stored as base64:  [12-byte IV][ciphertext][16-byte tag]
// Plaintext prefix `enc:v1:` identifies a value we wrote (vs. any pre-existing
// plaintext row) so migration / reads stay safe during the rollout.

const VERSION_TAG = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'ENCRYPTION_KEY env var missing or too short (need >= 16 chars)',
    );
  }
  cachedKey = createHash('sha256').update(raw).digest();
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, ciphertext, tag]).toString('base64');
  return `${VERSION_TAG}${payload}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(VERSION_TAG)) {
    // Backwards-compatible: a row written before encryption was added still
    // holds plaintext. Return as-is so existing callers don't break. A
    // follow-up migration should re-save all rows through the transformer
    // to upgrade them in place.
    return stored;
  }
  const buf = Buffer.from(stored.slice(VERSION_TAG.length), 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

// TypeORM column transformer: writes ciphertext, reads plaintext. Null-safe.
export const encryptedColumn: ValueTransformer = {
  to(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null;
    return encryptSecret(value);
  },
  from(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return decryptSecret(value);
  },
};

// Transformer for JSON-shaped secrets (e.g. FeedConfig.credentials). Stored as
// AES-GCM ciphertext in a TEXT column; deserialised back into the original
// object on read. Pre-encryption legacy rows (raw JSON or already-parsed
// objects from MySQL JSON columns) are tolerated.
export const encryptedJsonColumn: ValueTransformer = {
  to(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    if (!json || json === 'null') return null;
    return encryptSecret(json);
  },
  from(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    // MySQL JSON columns hand us a parsed object; encrypted TEXT columns hand
    // us a string. Treat anything non-string as an already-parsed legacy row.
    if (typeof value !== 'string') return value;
    if (value === '') return null;
    const plain = decryptSecret(value);
    if (!plain) return null;
    try {
      return JSON.parse(plain);
    } catch {
      return null;
    }
  },
};
