import type { WidgetConfig } from '@/types';

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildPropertyUrl(
  property: { id: number; reference: string; title: string },
  config: Pick<WidgetConfig, 'propertyPageUrl' | 'propertyPageSlug' | 'propertyRefPosition'>,
): string {
  if (config.propertyPageUrl) {
    return `${config.propertyPageUrl}?id=${property.id}&ref=${property.reference}`;
  }
  const slug = config.propertyPageSlug || 'property';
  const titleSlug = slugifyTitle(property.title);
  const ref = property.reference;
  const segment = config.propertyRefPosition === 'start'
    ? `${ref}_${titleSlug}`
    : `${titleSlug}_${ref}`;
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
