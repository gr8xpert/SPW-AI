import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  describe('unset / empty', () => {
    it('returns no-trust when undefined', () => {
      const r = parseTrustProxy(undefined, true);
      expect(r.value).toBe(false);
      expect(r.source).toBe('unset');
      expect(r.wildcardInProduction).toBe(false);
    });

    it('returns no-trust for an empty string', () => {
      const r = parseTrustProxy('', true);
      expect(r.value).toBe(false);
      expect(r.source).toBe('unset');
    });

    it('returns no-trust for whitespace-only', () => {
      const r = parseTrustProxy('   ', true);
      expect(r.value).toBe(false);
      expect(r.source).toBe('unset');
    });
  });

  describe('wildcard forms', () => {
    it.each(['true', 'True', 'TRUE', '*', 'all'])('treats %p as wildcard', (val) => {
      const r = parseTrustProxy(val, true);
      expect(r.value).toBe(true);
      expect(r.source).toBe('env');
    });

    it('flags wildcardInProduction in production', () => {
      const r = parseTrustProxy('true', true);
      expect(r.wildcardInProduction).toBe(true);
    });

    it('does NOT flag wildcardInProduction outside production', () => {
      const r = parseTrustProxy('true', false);
      expect(r.wildcardInProduction).toBe(false);
    });
  });

  describe('explicit no-trust', () => {
    it.each(['false', 'off', 'none'])('treats %p as no-trust', (val) => {
      const r = parseTrustProxy(val, true);
      expect(r.value).toBe(false);
      expect(r.source).toBe('env');
      expect(r.wildcardInProduction).toBe(false);
    });
  });

  describe('Express presets', () => {
    it.each(['loopback', 'LOOPBACK', 'linklocal', 'uniquelocal'])(
      'passes preset %p through (lowercased)',
      (val) => {
        const r = parseTrustProxy(val, true);
        expect(r.value).toBe(val.toLowerCase());
        expect(r.source).toBe('env');
        expect(r.wildcardInProduction).toBe(false);
      },
    );
  });

  describe('integer hop counts', () => {
    it('accepts 0', () => {
      const r = parseTrustProxy('0', true);
      expect(r.value).toBe(0);
    });

    it('accepts 1 (typical: nginx → app)', () => {
      const r = parseTrustProxy('1', true);
      expect(r.value).toBe(1);
    });

    it('accepts 2 (CF → nginx → app)', () => {
      const r = parseTrustProxy('2', true);
      expect(r.value).toBe(2);
    });

    it('rejects absurdly large hop counts (returns no-trust)', () => {
      const r = parseTrustProxy('999', true);
      expect(r.value).toBe(false);
      expect(r.source).toBe('env');
    });

    it('does NOT treat "10.0.0.1" as the number 10', () => {
      // Spot-check: an IP that starts with digits must not parse as integer.
      const r = parseTrustProxy('10.0.0.1', true);
      expect(r.value).toBe('10.0.0.1');
    });
  });

  describe('IP / CIDR lists', () => {
    it('accepts a single IP', () => {
      const r = parseTrustProxy('10.0.0.1', true);
      expect(r.value).toBe('10.0.0.1');
    });

    it('accepts a single CIDR', () => {
      const r = parseTrustProxy('10.0.0.0/8', true);
      expect(r.value).toBe('10.0.0.0/8');
    });

    it('accepts a comma-separated list', () => {
      const r = parseTrustProxy('10.0.0.0/8,172.16.0.0/12', true);
      expect(r.value).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
    });

    it('accepts a space-separated list', () => {
      const r = parseTrustProxy('10.0.0.1 10.0.0.2', true);
      expect(r.value).toEqual(['10.0.0.1', '10.0.0.2']);
    });

    it('tolerates extra whitespace and trailing commas', () => {
      const r = parseTrustProxy('  10.0.0.0/8 ,  172.16.0.0/12  ,', true);
      expect(r.value).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
    });
  });
});
