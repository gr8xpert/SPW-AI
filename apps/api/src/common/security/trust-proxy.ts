// Trust-proxy configuration for Express, parsed from the TRUST_PROXY env var.
//
// Why this matters: `req.ip` is derived from the X-Forwarded-For header only
// when Express's `trust proxy` is set. Otherwise `req.ip` is the socket peer,
// which behind nginx is the proxy IP (typically 127.0.0.1) for every request.
//
// The ApiKeyThrottlerGuard now buckets unknown-key probes by `req.ip` (see
// MAX_UNKNOWN_PROBES_PER_IP). If every client looks like 127.0.0.1, one
// attacker would exhaust the per-IP probe budget for everyone, then every
// subsequent unknown key would short-circuit to anon without a DB lookup —
// not a security failure, but a precision-of-defence failure. We want the
// real client IP.
//
// Setting `trust proxy: true` (or '*') trusts the LAST entry of X-Forwarded-For
// unconditionally, which a hostile client can forge if anything in front
// accepts arbitrary X-Forwarded-For from the public internet. So we accept
// it but it's flagged in the boot audit as unsafe in production.
//
// Recommended values:
//   loopback                — nginx on the SAME host (the typical setup).
//                             Trusts 127.0.0.1/8 + ::1 only.
//   <CIDR list>             — nginx / LB on a different box.
//                             e.g. "10.0.0.0/8,172.16.0.0/12".
//   <integer>               — number of trusted hops in front of the app.
//                             Use this when you know the exact proxy depth
//                             (e.g. 2 = Cloudflare → nginx → app).
//   (unset)                 — no trust. req.ip == raw socket peer.

export type TrustProxyValue =
  | boolean
  | number
  | string
  | string[]
  | ((ip: string, hopIndex: number) => boolean);

export interface TrustProxyParseResult {
  // Value to hand to `app.set('trust proxy', ...)`. `false` means "do not call
  // app.set" — Express's own default already disables proxy trust.
  value: TrustProxyValue;
  // Source the value was derived from. Logged at boot for operator clarity.
  source: 'unset' | 'env';
  // Set when the env value was syntactically usable but operationally risky
  // (e.g. wildcard trust in production). Surfaced via boot-audit so the
  // operator sees it on the same banner as other security issues.
  wildcardInProduction: boolean;
}

export function parseTrustProxy(
  raw: string | undefined,
  isProduction: boolean,
): TrustProxyParseResult {
  if (raw === undefined || raw === null) {
    return { value: false, source: 'unset', wildcardInProduction: false };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { value: false, source: 'unset', wildcardInProduction: false };
  }

  const lower = trimmed.toLowerCase();

  // Wildcard / "trust everything" form. Permitted but flagged in prod —
  // an upstream that forwards arbitrary X-Forwarded-For would let any
  // client spoof their IP. Only safe behind a proxy that ALWAYS strips
  // and re-writes that header.
  if (lower === 'true' || lower === '*' || lower === 'all') {
    return {
      value: true,
      source: 'env',
      wildcardInProduction: isProduction,
    };
  }

  if (lower === 'false' || lower === 'off' || lower === 'none') {
    return { value: false, source: 'env', wildcardInProduction: false };
  }

  // Express accepts the literal string "loopback" (also "linklocal",
  // "uniquelocal") as a preset. Keep these intact rather than converting
  // to a regex/list.
  const PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);
  if (PRESETS.has(lower)) {
    return { value: lower, source: 'env', wildcardInProduction: false };
  }

  // Pure integer → "trust N hops". Express interprets this as: skip the
  // last N entries of X-Forwarded-For and use the one before that as the
  // client IP. Reject negatives and absurdly large values.
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n >= 0 && n <= 10) {
      return { value: n, source: 'env', wildcardInProduction: false };
    }
    // Out-of-range integer: fall through to "no trust" rather than silently
    // accept something nonsensical.
    return { value: false, source: 'env', wildcardInProduction: false };
  }

  // Comma- or space-separated list of IPs / CIDRs. Express accepts these
  // directly as an array. We pass them through as-is; invalid entries
  // would surface at app boot when Express tries to parse them.
  const parts = trimmed
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) {
    return { value: false, source: 'unset', wildcardInProduction: false };
  }
  return {
    value: parts.length === 1 ? parts[0] : parts,
    source: 'env',
    wildcardInProduction: false,
  };
}
