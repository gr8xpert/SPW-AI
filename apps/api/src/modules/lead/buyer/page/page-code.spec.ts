import { agencyHosts, buyerPageLink, newPageCode, onAgencySite, validPageCode } from './page-code';

describe('page codes', () => {
  it('are 16 base62 characters and do not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const c = newPageCode();
      expect(c).toMatch(/^[0-9A-Za-z]{16}$/);
      seen.add(c);
    }
    expect(seen.size).toBe(1000);
  });

  it('validates the shape only', () => {
    expect(validPageCode('8kQ2xF9aZ0Hm3pQr')).toBe(true);
    expect(validPageCode('8kQ2xF9aZ0')).toBe(false);
    expect(validPageCode('8kQ2xF9aZ0Hm3pQ!')).toBe(false);
    expect(validPageCode("8kQ2xF9aZ0Hm3p'r")).toBe(false);
    expect(validPageCode(undefined)).toBe(false);
  });
});

describe('buyerPageLink', () => {
  const fallbackBase = 'https://api.example.com/p/';
  const code = 'AbCdE12345';

  it("uses the buyer's language address, then the default", () => {
    const urls = { default: 'https://site.com/my-properties/', nl: 'https://site.com/nl/mijn-woningen/' };
    expect(buyerPageLink(code, 'nl', { urls, fallbackBase })).toBe('https://site.com/nl/mijn-woningen/?t=AbCdE12345');
    expect(buyerPageLink(code, 'es', { urls, fallbackBase })).toBe('https://site.com/my-properties/?t=AbCdE12345');
  });

  it('keeps a query the address already has', () => {
    expect(buyerPageLink(code, 'en', { urls: { default: 'https://site.com/page?lang=en' }, fallbackBase })).toBe('https://site.com/page?lang=en&t=AbCdE12345');
  });

  it('then the page the WordPress plugin reported', () => {
    expect(buyerPageLink(code, 'en', { urls: {}, pluginUrl: 'https://wp.site/my-properties/', fallbackBase })).toBe('https://wp.site/my-properties/?t=AbCdE12345');
  });

  it('else the SPM fallback page', () => {
    expect(buyerPageLink(code, 'en', { urls: {}, fallbackBase })).toBe('https://api.example.com/p/AbCdE12345');
    expect(buyerPageLink(code, 'en', { urls: {}, pluginUrl: null, fallbackBase: 'https://api.example.com/p' })).toBe('https://api.example.com/p/AbCdE12345');
  });

  it('ignores an address that is not http(s)', () => {
    expect(buyerPageLink(code, 'en', { urls: { default: 'javascript:alert(1)' }, pluginUrl: 'ftp://x', fallbackBase })).toBe('https://api.example.com/p/AbCdE12345');
  });
});

describe('plugin page trust', () => {
  const hosts = agencyHosts('costa.example', 'https://www.costa.example/en/');

  it("knows the agency's own hosts (domain and website, with or without www)", () => {
    expect([...hosts].sort()).toEqual(['costa.example']);
    expect(agencyHosts(null, null).size).toBe(0);
    expect(agencyHosts('localhost', 'not a url').size).toBe(1);
  });

  it('accepts a page on the agency site only', () => {
    expect(onAgencySite('https://costa.example/my-properties/', hosts)).toBe(true);
    expect(onAgencySite('https://www.costa.example/my-properties/', hosts)).toBe(true);
    expect(onAgencySite('https://evil.example/my-properties/', hosts)).toBe(false);
    expect(onAgencySite('https://costa.example.evil.example/x', hosts)).toBe(false);
    expect(onAgencySite('javascript:alert(1)', hosts)).toBe(false);
    expect(onAgencySite('https://costa.example/x', new Set())).toBe(false);
  });
});
