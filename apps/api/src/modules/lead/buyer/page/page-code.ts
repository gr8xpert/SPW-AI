import { randomBytes } from 'crypto';

// The personal buyer page link. The code is the only secret: random,
// stored on the buyer (leads.pageCode), switched off or replaced by the
// agent. 16 base62 characters ≈ 95 bits (fits leads.pageCode VARCHAR(16)).

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const LENGTH = 16;

export function newPageCode(): string {
  let out = '';
  while (out.length < LENGTH) {
    for (const b of randomBytes(16)) {
      // 248 = 4 × 62: drop the top bytes so every character is equally likely.
      if (b < 248 && out.length < LENGTH) out += ALPHABET[b % 62];
    }
  }
  return out;
}

export function validPageCode(code: unknown): code is string {
  return typeof code === 'string' && /^[0-9A-Za-z]{16}$/.test(code);
}

function httpUrl(v: unknown): URL | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

// The agency's own website hosts (tenant domain, settings.websiteUrl),
// without "www.". A page the WordPress plugin reports is trusted only on
// one of these: the plugin's headers come with the public widget key, so
// anyone could otherwise point buyers' private links at another site.
export function agencyHosts(domain: string | null | undefined, websiteUrl: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (domain && /^[a-z0-9.-]+(:\d+)?$/i.test(domain.trim())) out.add(bareHost(domain.trim()));
  const site = httpUrl(websiteUrl);
  if (site) out.add(bareHost(site.host));
  return out;
}

export function onAgencySite(url: unknown, hosts: Set<string>): boolean {
  const u = httpUrl(url);
  return !!u && hosts.has(bareHost(u.host));
}

// Where the buyer's link points: the agency's page in the buyer's language,
// else its default page, else the page the WordPress plugin reported, else
// the SPM fallback page.
export function buyerPageLink(
  code: string,
  lang: string,
  opts: { urls: Record<string, string>; pluginUrl?: string | null; fallbackBase: string },
): string {
  const base = httpUrl(opts.urls[lang]) || httpUrl(opts.urls.default) || httpUrl(opts.pluginUrl);
  if (base) {
    base.searchParams.set('t', code);
    return base.toString();
  }
  return `${opts.fallbackBase.replace(/\/+$/, '')}/${code}`;
}
