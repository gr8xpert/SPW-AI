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
): string | null {
  if (config.propertyPageUrl) {
    return `${config.propertyPageUrl}?id=${property.id}&ref=${property.reference}`;
  }
  if (config.propertyPageSlug) {
    const titleSlug = slugifyTitle(property.title);
    const ref = property.reference;
    const segment = config.propertyRefPosition === 'start'
      ? `${ref}_${titleSlug}`
      : `${titleSlug}_${ref}`;
    return `/${config.propertyPageSlug}/${segment}`;
  }
  return null;
}

export function extractRefFromSegment(segment: string, position?: 'start' | 'end'): string {
  const underscoreIdx = segment.indexOf('_');
  if (underscoreIdx !== -1) {
    const left = segment.substring(0, underscoreIdx);
    const right = segment.substring(underscoreIdx + 1);
    if (position === 'start') return left;
    if (position === 'end') return right;
    const leftIsSlug = /^[a-z0-9-]+$/.test(left) && left.includes('-');
    return leftIsSlug ? right : left;
  }
  // Legacy: no underscore — entire segment if it looks like a ref
  if (!/[a-z]/.test(segment) || !/[-]/.test(segment)) return segment;
  // Heuristic: last uppercase part after dash-separated lowercase slug
  const match = segment.match(/^([a-z0-9-]+?)-([A-Z0-9][\w-]*)$/);
  if (match) return match[2];
  return segment;
}
