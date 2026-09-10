// Ordering helpers for entities whose display text is a JSON i18n map
// (`{ en: "Málaga", es: "Málaga" }`) and which also support manual drag-reorder
// via a `sortOrder` column.

/**
 * Resolve an i18n map to a single sortable string: `en` first, then the first
 * non-empty value, then ''. Mirrors the fallback order used by
 * resolve-name.interceptor, minus the per-request language — sort order must be
 * stable for everyone, not vary by Accept-Language.
 */
export function i18nName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const map = value as Record<string, unknown>;
    const en = map.en;
    if (typeof en === 'string' && en.trim()) return en;
    for (const v of Object.values(map)) {
      if (typeof v === 'string' && v.trim()) return v;
    }
  }
  return '';
}

/**
 * Manual ordering wins; alphabetical is the tie-break.
 *
 * Rows that have never been dragged all carry the default `sortOrder = 0`, so
 * before this the effective order was insertion/id order — which is why the
 * Locations tree and Property Types listed in a seemingly random order. Falling
 * back to the name makes alphabetical the default without overriding a manual
 * arrangement: as soon as a drag assigns distinct sortOrder values, those win.
 *
 * `localeCompare` with sensitivity 'base' folds accents, so "Cádiz" sorts under
 * C and "Álora" under A rather than after Z. `numeric` keeps "Zone 2" before
 * "Zone 10".
 */
export function bySortOrderThenName<
  T extends { sortOrder?: number | null; name?: unknown },
>(a: T, b: T): number {
  const ao = a.sortOrder ?? 0;
  const bo = b.sortOrder ?? 0;
  if (ao !== bo) return ao - bo;
  return i18nName(a.name).localeCompare(i18nName(b.name), 'en', {
    sensitivity: 'base',
    numeric: true,
  });
}
