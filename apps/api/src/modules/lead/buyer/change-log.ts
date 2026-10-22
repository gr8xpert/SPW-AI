// The buyer change log: which fields a save changed, from → to. Pure;
// BuyerChangeLogService turns ids into names and writes the row.

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return null;
}

function asDay(v: unknown): string | null {
  if (v instanceof Date) return isNaN(+v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'string' && DAY.test(v)) return v;
  return null;
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) {
    const items = v.map(canonical);
    // Lists of plain ids/strings are sets; lists of objects keep their order.
    return JSON.stringify(v.every((x) => typeof x !== 'object' || x === null) ? items.sort() : items);
  }
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return JSON.stringify(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  }
  return JSON.stringify(v);
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) || isEmpty(b)) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) === Number(b);
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null) return na === nb;
  const da = asDay(a);
  const db = asDay(b);
  if (da !== null && db !== null) return da === db;
  if (a instanceof Date && b instanceof Date) return +a === +b;
  return canonical(a) === canonical(b);
}

// Fields missing from `after` were not sent, so they did not change.
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  fields: readonly string[],
  prefix = '',
): FieldChange[] {
  const b = before || {};
  const a = after || {};
  const out: FieldChange[] = [];
  for (const f of fields) {
    if (!(f in a) || a[f] === undefined) continue;
    const from = b[f] === undefined ? null : b[f];
    const to = a[f];
    if (!sameValue(from, to)) out.push({ field: `${prefix}${f}`, from, to });
  }
  return out;
}

// Every wishlist key, for the change log (a key left out = removed).
export const WISHLIST_FIELDS = [
  'listingTypes', 'locationIds', 'propertyTypeIds', 'minBedrooms', 'minBathrooms', 'budgetMin', 'budgetMax', 'currency',
  'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize', 'featureIds', 'sendMatchesTo',
] as const;

// What changed between two wishlists, key by key.
export function wishlistChanges(before: unknown, after: unknown): FieldChange[] {
  const a = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const full = Object.fromEntries(WISHLIST_FIELDS.map((k) => [k, a[k] ?? null]));
  return diffFields(before as Record<string, unknown> | null, full, WISHLIST_FIELDS, 'wishlist.');
}

// What changed between two answer sets, question by question.
export function answerChanges(before: Record<string, string[]> | null | undefined, after: Record<string, string[]> | null | undefined): FieldChange[] {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  return keys
    .filter((k) => !sameValue(before?.[k] ?? null, after?.[k] ?? null))
    .map((k) => ({ field: `answers.${k}`, from: before?.[k] ?? null, to: after?.[k] ?? null }));
}
