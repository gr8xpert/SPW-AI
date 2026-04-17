import { URL } from 'url';
import { isIP } from 'net';

// Basic SSRF guard. Rejects targets that resolve-without-DNS to loopback,
// link-local, or RFC1918 private ranges, and rejects non-http(s) schemes.
// This is a best-effort pre-flight; we don't resolve DNS here (that would
// be racy against DNS rebinding — mitigation is to egress through a proxy
// that enforces the same rules at connect time, out of scope for MVP).
//
// In E2E tests we deliberately point webhooks at 127.0.0.1. Set
// `WEBHOOK_ALLOW_LOOPBACK=true` in .env.test to opt out of the loopback
// check only — private-IP and scheme checks still apply.
export interface WebhookTargetCheck {
  ok: boolean;
  reason?: string;
}

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

  const host = url.hostname.toLowerCase();

  const allowLoopback = process.env.WEBHOOK_ALLOW_LOOPBACK === 'true';
  if (!allowLoopback && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) {
    return { ok: false, reason: 'loopback' };
  }

  // Literal IP ranges we refuse: loopback (already handled above), link-local,
  // RFC1918 private, CG-NAT, IPv6 unique-local. Resolving DNS names is left to
  // the network layer.
  const ipKind = isIP(host);
  if (ipKind === 4 && isPrivateIPv4(host)) {
    return { ok: false, reason: 'private_ip' };
  }
  if (ipKind === 6 && isPrivateIPv6(host)) {
    return { ok: false, reason: 'private_ip' };
  }

  return { ok: true };
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CG-NAT
  if (a === 0) return true; // unspecified
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  if (lower.startsWith('fe80')) return true; // link-local
  return false;
}
