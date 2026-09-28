// The path segment of a property's page on the client website
// (`/{detail-slug}/{segment}`), computed in ONE place so the widget's links,
// the sitemap and the page's canonical tag are always the same URL.
//
// The reference is always separated from the words by an underscore: refs
// contain dashes (R5P-123), so "R5P-123-luxury-villa" couldn't be split back
// into ref + words. Readers (widget extractRefCandidates, plugin
// SPW_Rewrite::ref_candidates) try both sides of the first underscore.

export const SLUG_FORMATS = ['ref', 'ref-title', 'title-ref', 'location-type-ref', 'ref-type-location'] as const;
export type SlugFormat = (typeof SLUG_FORMATS)[number];
export const DEFAULT_SLUG_FORMAT: SlugFormat = 'title-ref';

const FOLD: Record<string, string> = { ß: 'ss', æ: 'ae', ø: 'o', œ: 'oe', đ: 'd', ł: 'l', þ: 'th' };

// Must stay identical to slugifyTitle in apps/widget/src/core/url-utils.ts
// (the widget's fallback when an older API response has no urlSegment).
export function slugifyTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f)
    .map((c) => FOLD[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function isSlugFormat(value: unknown): value is SlugFormat {
  return typeof value === 'string' && (SLUG_FORMATS as readonly string[]).includes(value);
}

export interface UrlSegmentInput {
  reference: string;
  title?: string | null;
  slug?: string | null;
  location?: { name?: string | null } | null;
  propertyType?: { name?: string | null } | null;
}

export function propertyUrlSegment(p: UrlSegmentInput, format: unknown): string {
  const fmt = isSlugFormat(format) ? format : DEFAULT_SLUG_FORMAT;
  const ref = p.reference;
  const location = p.location?.name || '';
  const type = p.propertyType?.name || '';
  // A slug typed on the property replaces the words, whatever the format.
  let words = p.slug ? slugifyTitle(p.slug) : '';
  if (!words) {
    if (fmt === 'ref') return ref;
    const parts = fmt === 'location-type-ref' ? [location, type] : fmt === 'ref-type-location' ? [type, location] : [p.title || ''];
    words = slugifyTitle(parts.filter(Boolean).join(' '));
  }
  if (!words) return ref;
  return fmt === 'ref-title' || fmt === 'ref-type-location' ? `${ref}_${words}` : `${words}_${ref}`;
}
