import { linkSecret, signLinkToken, verifyLinkToken } from './link-token';

const KEY = linkSecret({ JWT_SECRET: 'test-jwt-secret' });

describe('link tokens', () => {
  it('round-trips an open token (send only)', () => {
    const t = signLinkToken(KEY, 'o', 42);
    expect(verifyLinkToken(KEY, 'o', t)).toEqual({ sendId: 42 });
  });

  it('round-trips a click token (send + property)', () => {
    const t = signLinkToken(KEY, 'c', 42, 7001);
    expect(verifyLinkToken(KEY, 'c', t)).toEqual({ sendId: 42, propertyId: 7001 });
  });

  it('is URL-safe and carries no readable personal data', () => {
    const t = signLinkToken(KEY, 'c', 42, 7001);
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    expect(t).not.toMatch(/@/);
  });

  it('rejects a token signed for the other purpose', () => {
    const t = signLinkToken(KEY, 'o', 42);
    expect(verifyLinkToken(KEY, 'c', t)).toBeNull();
  });

  it('rejects a changed payload', () => {
    const t = signLinkToken(KEY, 'c', 42, 7001);
    const other = signLinkToken(KEY, 'c', 43, 7001);
    const forged = `${other.split('.')[0]}.${t.split('.')[1]}`;
    expect(verifyLinkToken(KEY, 'c', forged)).toBeNull();
  });

  it('rejects a changed mac, another secret, garbage and empty', () => {
    const t = signLinkToken(KEY, 'o', 42);
    const flipped = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
    expect(verifyLinkToken(KEY, 'o', flipped)).toBeNull();
    expect(verifyLinkToken(linkSecret({ JWT_SECRET: 'other' }), 'o', t)).toBeNull();
    expect(verifyLinkToken(KEY, 'o', 'not-a-token')).toBeNull();
    expect(verifyLinkToken(KEY, 'o', '')).toBeNull();
    expect(verifyLinkToken(KEY, 'o', 'a.b.c')).toBeNull();
  });

  it('rejects ids that are not positive integers, even when signed', () => {
    expect(() => signLinkToken(KEY, 'o', 0)).toThrow();
    expect(() => signLinkToken(KEY, 'c', 1, -5)).toThrow();
  });

  it('prefers BUYER_LINK_SECRET and never uses the raw JWT secret', () => {
    expect(linkSecret({ BUYER_LINK_SECRET: 'x'.repeat(32), JWT_SECRET: 'j' }).toString()).toBe('x'.repeat(32));
    expect(linkSecret({ JWT_SECRET: 'j' }).toString('utf8')).not.toBe('j');
    expect(() => linkSecret({})).toThrow();
  });
});
