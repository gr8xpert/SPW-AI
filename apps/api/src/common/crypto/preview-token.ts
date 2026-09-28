import { createHash, createHmac, timingSafeEqual } from 'crypto';

// Short-lived stand-in for a tenant's widget API key, used by the dashboard's
// template gallery to render live previews with the client's own listings.
// The real key is only stored hashed, so the dashboard can't hand it to a
// preview page. Format: spmpv_<tenantId>_<expiresUnix>_<hmac>. Accepted only
// by the read-only public endpoints (see TenantService.findWidgetTenantForRead)
// so a preview can't create leads or analytics.
const PREFIX = 'spmpv_';
export const PREVIEW_TOKEN_TTL_SECONDS = 2 * 60 * 60;

function secret(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 16) throw new Error('ENCRYPTION_KEY env var missing or too short');
  return createHash('sha256').update(`widget-preview:${raw}`).digest();
}

function sign(tenantId: number, expires: number): string {
  return createHmac('sha256', secret()).update(`${tenantId}.${expires}`).digest('hex').slice(0, 40);
}

export function createPreviewToken(tenantId: number, now = Date.now()): { token: string; expiresAt: string } {
  const expires = Math.floor(now / 1000) + PREVIEW_TOKEN_TTL_SECONDS;
  return {
    token: `${PREFIX}${tenantId}_${expires}_${sign(tenantId, expires)}`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

export function isPreviewToken(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

// Tenant id of a valid, unexpired token; null otherwise.
export function verifyPreviewToken(value: string | undefined | null, now = Date.now()): number | null {
  if (!isPreviewToken(value)) return null;
  const match = /^spmpv_(\d{1,10})_(\d{10})_([0-9a-f]{40})$/.exec(value as string);
  if (!match) return null;
  const tenantId = Number(match[1]);
  const expires = Number(match[2]);
  if (!tenantId || expires * 1000 <= now) return null;
  let expected: string;
  try {
    expected = sign(tenantId, expires);
  } catch {
    return null;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(match[3]);
  return a.length === b.length && timingSafeEqual(a, b) ? tenantId : null;
}
