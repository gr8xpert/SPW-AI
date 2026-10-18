// One address per property page. Crawlers pick up links with extra
// parameters (?page=2, ?ref=…, leftovers from other sites) and each variant
// would be rendered as a page of its own; this sends them to the clean
// address with a 301. Tracking parameters stay (they don't change the page).
//
// Used by proxy.ts (Next 16) / middleware.ts (Next 14–15), see the example.
import { NextResponse, type NextRequest } from 'next/server';

const TRACKING = new Set([
  'gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid', 'yclid', 'twclid', 'ttclid',
  'li_fat_id', 'mc_cid', 'mc_eid', '_ga', '_gl', 'srsltid', 'igshid',
]);

/** A 301 to the same property page without unknown parameters, or null. */
export function spmCleanPropertyUrl(request: NextRequest, keep: string[] = []): NextResponse | null {
  const url = request.nextUrl.clone();
  let changed = false;
  for (const key of Array.from(url.searchParams.keys())) {
    if (key.startsWith('utm_') || TRACKING.has(key) || keep.includes(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
    changed = true;
  }
  return changed ? NextResponse.redirect(url, 301) : null;
}
