import { encryptSecret, decryptSecret, encryptedColumn } from './secret-cipher';

describe('secret-cipher', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'test-encryption-key-1234567890xx';
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it('round-trips short secrets', () => {
    const plain = 'AKIAEXAMPLEKEY1234';
    const enc = encryptSecret(plain);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('produces different ciphertext per call (IV is random)', () => {
    const plain = 'some-secret-value';
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it('decrypt rejects tampered ciphertext', () => {
    const enc = encryptSecret('sensitive');
    // Flip a byte in the base64 payload.
    const [prefix, payload] = enc.split(':v1:');
    const buf = Buffer.from(payload, 'base64');
    buf[20] = buf[20] ^ 0xff;
    const tampered = `${prefix}:v1:${buf.toString('base64')}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('returns plaintext unchanged for legacy (unprefixed) values', () => {
    expect(decryptSecret('legacy-plaintext-value')).toBe(
      'legacy-plaintext-value',
    );
  });

  it('transformer is null-safe in both directions', () => {
    expect(encryptedColumn.to(null)).toBeNull();
    expect(encryptedColumn.to('')).toBeNull();
    expect(encryptedColumn.to(undefined)).toBeNull();
    expect(encryptedColumn.from(null)).toBeNull();
  });

  it('transformer round-trips through to/from', () => {
    const plain = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    const stored = encryptedColumn.to(plain) as string;
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(encryptedColumn.from(stored)).toBe(plain);
  });
});
