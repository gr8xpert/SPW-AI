import { URL } from 'url';
import { isIP } from 'net';
import { promises as dns } from 'dns';

// SSRF guard for outbound webhook URLs. Three layers:
//
//   1. Scheme + literal-IP check — fast, synchronous. Catches obvious cases
//      (http://10.0.0.1, file:///, etc.) without any network IO.
//   2. DNS resolution (`validateWebhookTargetAsync`) — catches hostnames
//      that resolve to private/loopback IPs. Run at save time AND just
//      before dispatch so a DNS-rebound host that was public when saved
//      but private at dispatch time still gets blocked.
//   3. Network egress: webhook.processor disables redirects so a public
//      receiver can't 302 us to an internal host.
//
// In E2E tests we deliberately point webhooks at 127.0.0.1. Set
// `WEBHOOK_ALLOW_LOOPBACK=true` in .env.test to opt out of the loopback
// check only — private-IP and scheme checks still apply.
export interface WebhookTargetCheck {
  ok: boolean;
  reason?: string;
}

// Synchronous pre-flight: scheme + literal IP. Use this on hot paths where
// a DNS round-trip would add unacceptable latency. For webhook save and
// dispatch — call `validateWebhookTargetAsync` instead.
export function validateWebhookTarget(rawUrl: string): WebhookTargetCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'invalid_scheme' };
  }

  // Strip brackets that Node's URL parser keeps on IPv6 hostnames in some
  // versions ("[::1]" → "::1") so the literal-IP checks below work
  // consistently across runtimes.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Hostname literals we always block (even outside the IP grids below).
  const allowLoopback = process.env.WEBHOOK_ALLOW_LOOPBACK === 'true';
  if (!allowLoopback && host === 'localhost') {
    return { ok: false, reason: 'loopback' };
  }

  // Literal-IP path: normalise IPv4-mapped IPv6 (e.g. "::ffff:127.0.0.1")
  // down to the bare IPv4 so an attacker can't slip a private address past
  // the v4 grid by reusing the v6 form.
  const ipKind = isIP(host);
  if (ipKind === 4) {
    return checkIPv4(host, allowLoopback);
  }
  if (ipKind === 6) {
    const mapped = extractIPv4Mapped(host);
    if (mapped) {
      return checkIPv4(mapped, allowLoopback);
    }
    return checkIPv6(host, allowLoopback);
  }

  // Non-IP, non-localhost hostname — defer to DNS path. (Sync caller assumes
  // public; async caller will resolve.)
  return { ok: true };
}

// Full check including DNS resolution. Returns the same shape as the sync
// version. A 3s timeout keeps this from blocking a dispatch indefinitely if
// the receiver's DNS is down.
export async function validateWebhookTargetAsync(rawUrl: string): Promise<WebhookTargetCheck> {
  const sync = validateWebhookTarget(rawUrl);
  if (!sync.ok) return sync;

  // We already verified the URL parses; reaching here means scheme is http(s)
  // and any literal IP was public.
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // Literal IPs already passed the sync check — no DNS resolution needed.
  if (isIP(host)) return { ok: true };

  // DNS lookup. We want EVERY resolved address (A + AAAA) to be public; a
  // domain that round-robins between a public and a private IP would
  // otherwise sneak past a single-record lookup.
  let records: Array<{ address: string; family: number }>;
  try {
    records = await Promise.race([
      dns.lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('dns_timeout')), 3000),
      ),
    ]);
  } catch (err) {
    return {
      ok: false,
      reason: (err as Error).message === 'dns_timeout' ? 'dns_timeout' : 'dns_failed',
    };
  }

  if (records.length === 0) {
    return { ok: false, reason: 'dns_no_records' };
  }

  const allowLoopback = process.env.WEBHOOK_ALLOW_LOOPBACK === 'true';
  for (const r of records) {
    const addr = r.address.toLowerCase();
    // Re-use the literal-IP grids for the resolved addresses, including the
    // v4-mapped-v6 normalisation. Any record that fails turns the whole URL
    // into a rejection.
    if (r.family === 4) {
      const check = checkIPv4(addr, allowLoopback);
      if (!check.ok) return { ok: false, reason: `dns_${check.reason}` };
    } else if (r.family === 6) {
      const mapped = extractIPv4Mapped(addr);
      if (mapped) {
        const check = checkIPv4(mapped, allowLoopback);
        if (!check.ok) return { ok: false, reason: `dns_${check.reason}` };
      } else {
        const check = checkIPv6(addr, allowLoopback);
        if (!check.ok) return { ok: false, reason: `dns_${check.reason}` };
      }
    }
  }

  return { ok: true };
}

function checkIPv4(ip: string, allowLoopback: boolean): WebhookTargetCheck {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    // Malformed IPv4 — treat as invalid rather than letting it through.
    return { ok: false, reason: 'invalid_ip' };
  }
  const [a, b] = parts;
  // 127.0.0.0/8 — every address in the loopback range, not just 127.0.0.1.
  if (a === 127) {
    if (allowLoopback) return { ok: true };
    return { ok: false, reason: 'loopback' };
  }
  if (a === 0) return { ok: false, reason: 'private_ip' }; // 0.0.0.0/8 unspecified
  if (a === 10) return { ok: false, reason: 'private_ip' };
  if (a === 172 && b >= 16 && b <= 31) return { ok: false, reason: 'private_ip' };
  if (a === 192 && b === 168) return { ok: false, reason: 'private_ip' };
  if (a === 169 && b === 254) return { ok: false, reason: 'private_ip' }; // link-local
  if (a === 100 && b >= 64 && b <= 127) return { ok: false, reason: 'private_ip' }; // CG-NAT
  if (a >= 224 && a <= 239) return { ok: false, reason: 'private_ip' }; // multicast
  if (a >= 240) return { ok: false, reason: 'private_ip' }; // reserved
  return { ok: true };
}

function checkIPv6(ip: string, allowLoopback: boolean): WebhookTargetCheck {
  const lower = ip.toLowerCase();
  // Unspecified.
  if (lower === '::' || lower === '::0') return { ok: false, reason: 'private_ip' };
  // Loopback ::1.
  if (lower === '::1') {
    if (allowLoopback) return { ok: true };
    return { ok: false, reason: 'loopback' };
  }
  // Unique-local fc00::/7  →  first byte 0xfc..0xfd  →  prefix "fc"/"fd".
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return { ok: false, reason: 'private_ip' };
  }
  // Link-local fe80::/10.
  if (lower.startsWith('fe80')) return { ok: false, reason: 'private_ip' };
  // Multicast ff00::/8.
  if (lower.startsWith('ff')) return { ok: false, reason: 'private_ip' };
  return { ok: true };
}

// Returns the embedded IPv4 dotted form if `ip` is an IPv4-mapped IPv6
// address (e.g. "::ffff:7f00:1" or "::ffff:127.0.0.1") or null otherwise.
// IPv4-mapped addresses are how the kernel can route v4 traffic over a v6
// socket; an attacker can use this form to slip a private v4 past a v6-only
// check that doesn't know to extract.
function extractIPv4Mapped(ipv6: string): string | null {
  const lower = ipv6.toLowerCase();
  // Common dotted form: "::ffff:127.0.0.1"
  const dottedMatch = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dottedMatch) return dottedMatch[1];

  // Pure-hex form: "::ffff:7f00:1" — split the last two hextets into 4 bytes.
  const hexMatch = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch) {
    const hi = parseInt(hexMatch[1], 16);
    const lo = parseInt(hexMatch[2], 16);
    if (Number.isFinite(hi) && Number.isFinite(lo) && hi >= 0 && hi <= 0xffff && lo >= 0 && lo <= 0xffff) {
      return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    }
  }

  return null;
}
