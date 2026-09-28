import type { WidgetConfig } from '@/types';

const FOLD: Record<string, string> = { ß: 'ss', æ: 'ae', ø: 'o', œ: 'oe', đ: 'd', ł: 'l', þ: 'th' };

// Must stay identical to slugifyTitle in apps/api/src/modules/property/property-url.ts.
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f)
    .map((c) => FOLD[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface UrlProperty {
  id: number;
  reference: string;
  title: string;
  urlSegment?: string;
  slug?: string | null;
  location?: { name?: string } | null;
  propertyType?: { name?: string } | null;
}

type UrlConfig = Pick<WidgetConfig, 'propertyPageUrl' | 'propertyPageSlug' | 'propertyRefPosition' | 'slugFormat'>;

// Reference first in the address? (dashboard format, or the page's own setting)
export function refFirst(config: UrlConfig): boolean {
  if (config.propertyRefPosition) return config.propertyRefPosition === 'start';
  return config.slugFormat === 'ref-title' || config.slugFormat === 'ref-type-location';
}

// Same rules as propertyUrlSegment in the API, for responses without urlSegment.
function localSegment(p: UrlProperty, config: UrlConfig): string {
  const fmt = config.slugFormat || 'title-ref';
  let words = p.slug ? slugifyTitle(p.slug) : '';
  if (!words) {
    if (fmt === 'ref') return p.reference;
    const parts = fmt === 'location-type-ref'
      ? [p.location?.name, p.propertyType?.name]
      : fmt === 'ref-type-location'
        ? [p.propertyType?.name, p.location?.name]
        : [p.title];
    words = slugifyTitle(parts.filter(Boolean).join(' '));
  }
  if (!words) return p.reference;
  return refFirst(config) ? `${p.reference}_${words}` : `${words}_${p.reference}`;
}

export function buildPropertyUrl(property: UrlProperty, config: UrlConfig): string {
  if (config.propertyPageUrl) {
    return `${config.propertyPageUrl}?id=${property.id}&ref=${property.reference}`;
  }
  const slug = config.propertyPageSlug || 'property';
  // The API's segment wins unless the page itself asked for a ref position.
  const segment = property.urlSegment && !config.propertyRefPosition ? property.urlSegment : localSegment(property, config);
  return `/${slug}/${segment}`;
}

export function extractRefFromSegment(segment: string, position?: 'start' | 'end'): string {
  return extractRefCandidates(segment, position)[0] ?? segment;
}

// Possible references in a detail URL segment, most likely first. The caller
// tries them in order, so an ambiguous segment still resolves.
//
// Links are built as `${titleSlug}_${ref}` unless propertyRefPosition is
// 'start', and slugifyTitle only ever emits [a-z0-9-]. So with no explicit
// position, a lowercase-only left side is the title (e.g. `villa_R5P-1` →
// `R5P-1`; the old check also required a dash in the title and returned
// `villa` for one-word titles), otherwise the link is `${ref}_${title}`.
export function extractRefCandidates(segment: string, position?: 'start' | 'end'): string[] {
  const out: string[] = [];
  const add = (v: string | undefined) => {
    if (v && !out.includes(v)) out.push(v);
  };

  const underscoreIdx = segment.indexOf('_');
  if (underscoreIdx !== -1) {
    const left = segment.substring(0, underscoreIdx);
    const right = segment.substring(underscoreIdx + 1);
    // A `${ref}_${title}` link whose ref itself contains underscores.
    const beforeLast = segment.substring(0, segment.lastIndexOf('_'));
    const leftIsTitle = /^[a-z0-9-]+$/.test(left);
    if (position === 'start' || (position !== 'end' && !leftIsTitle)) {
      add(left);
      add(beforeLast);
      add(right);
    } else {
      add(right);
      add(left);
    }
    return out;
  }
  add(legacyRefFromSegment(segment));
  add(segment);
  return out;
}

function legacyRefFromSegment(segment: string): string {
  // Legacy: no underscore — entire segment if it looks like a ref
  if (!/[a-z]/.test(segment) || !/[-]/.test(segment)) return segment;
  // Heuristic: last uppercase part after dash-separated lowercase slug
  const match = segment.match(/^([a-z0-9-]+?)-([A-Z0-9][\w-]*)$/);
  if (match) return match[2];
  return segment;
}
