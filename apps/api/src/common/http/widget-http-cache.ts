import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { pickLang } from '../i18n/resolve-name.interceptor';

// Conditional GET for the public widget endpoints.
//
// The tenant is chosen by the X-API-Key HEADER, and Cloudflare (which proxies
// api.spw-ai.com) keys its cache on the URL and ignores Vary. So these
// responses must never be `public`/`s-maxage`: one cache rule would be enough
// to serve one client's listings on another client's site. Only the visitor's
// own browser may keep a copy.
//
// `no-cache` (store, but revalidate every time) rather than a max-age: the
// widget polls /sync-meta and refetches as soon as syncVersion moves, and a
// max-age would let the browser answer that refetch with the old copy, so a
// dashboard edit or feed import would stay invisible until it expired. A
// revalidation costs one tenant-row read and an empty 304; the listing query,
// which is the expensive part, is skipped.
export const WIDGET_CACHE_CONTROL = 'private, no-cache';

// Writes that change public data bump syncVersion (property edits, feeds,
// translations, SEO, CSV imports, location/type/feature edits, template
// apply), but a bump is best-effort and may be missed. The tag also rolls over
// every few minutes so a missed bump can leave a revisiting browser behind by
// at most this long, never indefinitely.
export const ETAG_TIME_BUCKET_MS = 5 * 60_000;

export interface WidgetEtagInput {
  tenantId: number;
  syncVersion: number;
  // The tenant's settings change the response too (slug format → urlSegment,
  // enabled listing types → what's visible), and saving them doesn't bump
  // syncVersion, so they're part of the tag. Already loaded with the tenant.
  settings: unknown;
  // Which endpoint, so /facets and /map with the same query don't share a tag.
  route: string;
  params?: Record<string, unknown>;
  query?: unknown;
  // Language the names/titles are resolved into (?lang or Accept-Language).
  lang: string;
  now?: number;
}

// Key order in a query object is whatever the client sent; ?a=1&b=2 and
// ?b=2&a=1 are the same search, so keys are sorted. Array order is kept —
// it can be meaningful.
function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function buildWidgetEtag(input: WidgetEtagInput): string {
  const bucket = Math.floor((input.now ?? Date.now()) / ETAG_TIME_BUCKET_MS);
  const hash = createHash('sha256')
    .update(
      stableStringify([
        'w1',
        input.tenantId,
        input.syncVersion,
        input.settings ?? null,
        input.route,
        input.params ?? {},
        input.query ?? {},
        input.lang,
        bucket,
      ]),
    )
    .digest('base64url')
    .slice(0, 32);
  // Weak: Cloudflare and nginx weaken strong tags when they compress, and the
  // body is equivalent rather than byte-identical across encodings anyway.
  return `W/"${hash}"`;
}

// Same rules as the `fresh` module Express uses for res.send's 304: weak
// comparison, `*` matches, and a request carrying Cache-Control: no-cache
// (hard reload) always gets a full response.
export function isNotModified(
  ifNoneMatch: string | string[] | undefined,
  requestCacheControl: string | string[] | undefined,
  etag: string,
): boolean {
  const header = Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : ifNoneMatch;
  if (!header) return false;
  const cc = Array.isArray(requestCacheControl) ? requestCacheControl.join(',') : requestCacheControl;
  if (cc && /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(cc)) return false;
  if (header.trim() === '*') return true;
  const bare = (t: string) => t.trim().replace(/^W\//, '');
  const target = bare(etag);
  return header.split(',').some((t) => bare(t) === target);
}

// Runs `load` only when the browser's copy is out of date.
//
// On a match it returns null without touching the database. Nest still sends
// that (wrapped) body with status 200, and Express's res.send turns it into a
// bodiless 304 because the request is fresh against the ETag set here — the
// same machinery behind Express's default ETags. That's also why the match is
// required to agree with `req.fresh`: if Express didn't see it as fresh, a
// null body would go out as a real 200.
//
// Cache-Control and the ETag are only left on successful responses: a 404 (a
// listing not published yet) must not be kept by the browser.
export async function withWidgetCache<T>(
  req: Request,
  res: Response,
  tag: Omit<WidgetEtagInput, 'lang' | 'query'>,
  load: () => Promise<T>,
): Promise<T | null> {
  res.vary('X-API-Key');
  res.vary('Accept-Language');
  const etag = buildWidgetEtag({ ...tag, query: req.query, lang: pickLang(req) });
  res.setHeader('ETag', etag);

  if (
    isNotModified(req.headers['if-none-match'], req.headers['cache-control'], etag) &&
    (req as { fresh?: boolean }).fresh !== false
  ) {
    res.setHeader('Cache-Control', WIDGET_CACHE_CONTROL);
    return null;
  }

  let body: T;
  try {
    body = await load();
  } catch (err) {
    res.removeHeader('ETag');
    throw err;
  }
  res.setHeader('Cache-Control', WIDGET_CACHE_CONTROL);
  return body;
}
