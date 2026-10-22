import { base32Decode, base32Encode, hotp, newRecoveryCodes, newSecret, normaliseRecoveryCode, otpauthUrl, totp, verifyTotp } from './totp';

const RFC_SECRET = Buffer.from('12345678901234567890');

describe('base32 (RFC 4648)', () => {
  it.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('%s ↔ %s', (plain, enc) => {
    expect(base32Encode(Buffer.from(plain))).toBe(enc);
    expect(base32Decode(enc).toString()).toBe(plain);
  });

  it('decodes lower case, spaces and padding; rejects junk', () => {
    expect(base32Decode('mzxw 6ytb oi======').toString()).toBe('foobar');
    expect(() => base32Decode('MZ1!')).toThrow();
  });
});

describe('HOTP (RFC 4226 appendix D)', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [9, '520489'],
  ])('counter %i → %s', (c, code) => expect(hotp(RFC_SECRET, c)).toBe(code));
});

describe('TOTP (RFC 6238 appendix B, SHA-1, 8 digits)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('T=%i → %s', (t, code) => expect(totp(RFC_SECRET, t * 1000, 8)).toBe(code));
});

describe('verifyTotp', () => {
  const now = 1_800_000_000_000;
  it('accepts now and ±1 step, not further', () => {
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 30_000), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now + 30_000), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, now - 90_000), now)).toBe(false);
  });

  it('spaces allowed; non-6-digit rejected', () => {
    const c = totp(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, `${c.slice(0, 3)} ${c.slice(3)}`, now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBe(false);
  });
});

describe('secrets, otpauth, recovery codes', () => {
  it('a new secret is 32 base32 chars (160 bits)', () => {
    expect(newSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('otpauth URL', () => {
    expect(otpauthUrl('SPM Dashboard', 'ann@x.com', 'ABC')).toBe(
      'otpauth://totp/SPM%20Dashboard%3Aann%40x.com?secret=ABC&issuer=SPM%20Dashboard&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('8 distinct readable codes', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/));
    expect(normaliseRecoveryCode(' ABCDE-fghij ')).toBe('abcdefghij');
  });
});
