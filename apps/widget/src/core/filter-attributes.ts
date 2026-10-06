import { store } from './store';
import type { Location, PropertyType, Feature, SearchFilters } from '@/types';

// Filters written on a block, in the same plain words on every platform:
//
//   <div data-spm-widget="listing-template-03"
//        data-spm-location="5216585" data-spm-under="500000"
//        data-spm-beds="3" data-spm-for="sale" data-spm-sort="newest"></div>
//
// IDs are the reliable way for location, type and features, because one name
// can belong to an area, a municipality and a town at once. A name is
// accepted only when it matches exactly ONE entry in the client's own lists;
// an ambiguous or unknown name is ignored, with a console message naming the
// ids to choose from (the WordPress plugin shows the same note to editors).

export const SORT_VALUES = ['create_date_desc', 'create_date', 'write_date_desc', 'write_date', 'list_price', 'list_price_desc', 'is_featured_desc', 'own_first', 'location_id'] as const;

const SORT_ALIASES: Record<string, string> = {
  newest: 'create_date_desc',
  latest: 'create_date_desc',
  oldest: 'create_date',
  updated: 'write_date_desc',
  recently_updated: 'write_date_desc',
  // V1 names, still in older sites' shortcodes
  last_date_desc: 'write_date_desc',
  last_date: 'write_date',
  create_date_asc: 'create_date',
  price_asc: 'list_price',
  price_low: 'list_price',
  cheapest: 'list_price',
  price_desc: 'list_price_desc',
  price_high: 'list_price_desc',
  featured: 'is_featured_desc',
  own: 'own_first',
  ours: 'own_first',
  location: 'location_id',
};

const LISTING_TYPES: Record<string, string> = {
  sale: 'sale',
  for_sale: 'sale',
  buy: 'sale',
  rent: 'rent',
  for_rent: 'rent',
  long_term: 'rent',
  holiday: 'holiday_rent',
  holiday_rent: 'holiday_rent',
  short_term: 'holiday_rent',
  development: 'development',
  new_development: 'development',
  offplan: 'development',
  off_plan: 'development',
};

export function normaliseSort(value: string): string | undefined {
  const v = key(value);
  if ((SORT_VALUES as readonly string[]).includes(v)) return v;
  return SORT_ALIASES[v];
}

function key(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter((c) => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const num = (value: string): number | undefined => {
  const n = Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// "3" → min 3; "3-4" / "3 to 4" → min 3, max 4.
function range(value: string): { min?: number; max?: number } {
  const m = /^\s*(\d+)\s*(?:-|–|to|\.\.)\s*(\d+)\s*$/i.exec(value);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const one = num(value);
  return one === undefined ? {} : { min: one };
}

type ListKind = 'location' | 'property type' | 'feature';

function rows(kind: ListKind): Array<Location | PropertyType | Feature> {
  const s = store.getState();
  if (kind === 'location') return s.locations || [];
  if (kind === 'property type') return s.propertyTypes || [];
  return s.features || [];
}

function describe(kind: ListKind, id: number): string {
  const all = rows(kind) as unknown as Array<Record<string, unknown>>;
  const row = all.find((r) => Number(r.id) === id);
  if (!row) return String(id);
  const what = [row.level, row.category].filter(Boolean).join(', ');
  return what ? `${id} (${row.name} — ${what})` : `${id} (${row.name})`;
}

/** An id from an id or a unique name; 0 (with a console note) otherwise. */
export function resolveId(kind: ListKind, value: string): number {
  const raw = String(value).trim();
  if (!raw) return 0;
  const all = rows(kind) as unknown as Array<Record<string, unknown>>;

  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    // Lists load with the page; before they arrive an id is taken as given.
    if (all.length && !all.some((r) => Number(r.id) === id)) {
      warn(`${kind} id ${id} is not in this website's list — filter ignored`);
      return 0;
    }
    return id;
  }

  const wanted = key(raw);
  const matches = all.filter((r) => key(String(r.name ?? '')) === wanted || key(String(r.slug ?? '')) === wanted);
  if (matches.length === 1) return Number(matches[0].id);
  if (!matches.length) {
    warn(`no ${kind} called "${raw}" — filter ignored`);
    return 0;
  }
  warn(`"${raw}" matches ${matches.length} ${kind}s — use the id instead: ${matches.map((m) => describe(kind, Number(m.id))).join(', ')}`);
  return 0;
}

function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[SPM] ${message}`);
}

export interface AttributeFilters {
  filters: SearchFilters;
  // Filters the visitor must not change (data-spm-fixed / lock-*).
  fixed: boolean;
}

const FIXED_KEYS = new Set(['fixed', 'locked']);
const TRUE = new Set(['1', 'true', 'yes', 'on', '']);

/**
 * Filters from a block's attributes. `attrs` keys are the part after
 * `data-spm-` (the mounter hands components exactly that).
 */
export function filtersFromAttributes(attrs: Record<string, unknown>): AttributeFilters {
  const filters: SearchFilters = {};
  let fixed = false;

  const set = (k: keyof SearchFilters, v: unknown) => {
    if (v !== undefined && v !== null && v !== '') (filters as Record<string, unknown>)[k] = v;
  };

  for (const [rawKey, rawValue] of Object.entries(attrs)) {
    if (rawValue == null || typeof rawValue === 'object' || typeof rawValue === 'function') continue;
    const value = String(rawValue).trim();
    const name = key(rawKey).replace(/^lock_/, '');
    if (FIXED_KEYS.has(name)) {
      if (TRUE.has(value.toLowerCase())) fixed = true;
      continue;
    }
    if (rawKey.startsWith('lock-') || rawKey.startsWith('lock_')) fixed = true;
    if (value === '') continue;

    switch (name) {
      case 'location': case 'area': case 'town': {
        const id = resolveId('location', value);
        if (id) set('locationId', id);
        break;
      }
      case 'type': case 'property_type': {
        const id = resolveId('property type', value);
        if (id) set('propertyTypeId', id);
        break;
      }
      case 'features': case 'feature': {
        const ids = value.split(',').map((v) => resolveId('feature', v)).filter(Boolean);
        if (ids.length) set('features', ids);
        break;
      }
      case 'for': case 'listing_type': {
        const v = LISTING_TYPES[key(value)];
        if (v) set('listingType', v);
        else warn(`"${value}" is not a listing type — use sale, rent, holiday or new-development`);
        break;
      }
      case 'beds': case 'bedrooms': {
        const r = range(value);
        set('minBedrooms', r.min);
        set('maxBedrooms', r.max);
        break;
      }
      case 'baths': case 'bathrooms': {
        const r = range(value);
        set('minBathrooms', r.min);
        set('maxBathrooms', r.max);
        break;
      }
      case 'price': {
        const r = range(value);
        set('minPrice', r.min);
        set('maxPrice', r.max);
        break;
      }
      case 'built': case 'built_area': {
        const r = range(value);
        set('minBuildSize', r.min);
        set('maxBuildSize', r.max);
        break;
      }
      case 'plot': case 'plot_size': {
        const r = range(value);
        set('minPlotSize', r.min);
        set('maxPlotSize', r.max);
        break;
      }
      case 'terrace': case 'terrace_size': {
        const r = range(value);
        set('minTerraceSize', r.min);
        set('maxTerraceSize', r.max);
        break;
      }
      case 'under': case 'max_price': set('maxPrice', num(value)); break;
      case 'over': case 'from': case 'min_price': set('minPrice', num(value)); break;
      case 'min_bedrooms': set('minBedrooms', num(value)); break;
      case 'max_bedrooms': set('maxBedrooms', num(value)); break;
      case 'min_bathrooms': set('minBathrooms', num(value)); break;
      case 'max_bathrooms': set('maxBathrooms', num(value)); break;
      case 'min_build_size': set('minBuildSize', num(value)); break;
      case 'max_build_size': set('maxBuildSize', num(value)); break;
      case 'min_plot_size': set('minPlotSize', num(value)); break;
      case 'max_plot_size': set('maxPlotSize', num(value)); break;
      case 'min_terrace_size': set('minTerraceSize', num(value)); break;
      case 'max_terrace_size': set('maxTerraceSize', num(value)); break;
      // One reference, or a hand-picked list: ref="R1, R2, R3" shows those
      // properties in that order.
      case 'reference': case 'ref': case 'references': case 'refs': {
        const refs = [...new Set(value.split(/[\s,;]+/).filter(Boolean))];
        if (refs.length > 1) set('references', refs.slice(0, 50));
        else set('reference', refs[0]);
        break;
      }
      // featured="yes" shows only the listings marked featured in the
      // dashboard; own="yes" only the agency's own, as opposed to ones shared
      // from a feed. Anything falsy leaves the filter off rather than asking
      // for the opposite, which nobody means by featured="no".
      case 'featured':
        if (TRUE.has(value.toLowerCase())) set('isFeatured', true);
        break;
      case 'own': case 'own_only':
        if (TRUE.has(value.toLowerCase())) set('isOwnProperty', true);
        break;
      // own-first keeps everything but puts the agency's own listings at the
      // top, so it is an order, not a filter.
      case 'own_first':
        if (TRUE.has(value.toLowerCase())) set('sortBy', 'own_first');
        break;
      case 'sort': case 'order': {
        const v = normaliseSort(value);
        if (v) set('sortBy', v);
        else warn(`"${value}" is not a sort order — use newest, oldest, price_asc, price_desc, featured or updated`);
        break;
      }
      case 'limit': set('limit', num(value)); break;
      case 'page': set('page', num(value)); break;
      default:
        break;
    }
  }

  // A hand-picked list shows every property on it unless limit says otherwise.
  if (filters.references && !filters.limit) filters.limit = filters.references.length;
  return { filters, fixed };
}

/** Every attribute name this engine understands (used by the docs/builder). */
export const FILTER_ATTRIBUTES = [
  'location', 'type', 'features', 'for', 'beds', 'baths', 'price', 'under', 'over',
  'built', 'plot', 'terrace', 'reference', 'featured', 'own', 'own-first', 'sort', 'limit', 'fixed',
];
