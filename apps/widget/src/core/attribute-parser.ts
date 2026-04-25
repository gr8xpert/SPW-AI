import type { SearchFilters, LockedFilters } from '@/types';

const ATTR_MAP: Record<string, keyof SearchFilters> = {
  'location': 'locationId',
  'listing-type': 'listingType',
  'property-type': 'propertyTypeId',
  'min-price': 'minPrice',
  'max-price': 'maxPrice',
  'min-bedrooms': 'minBedrooms',
  'max-bedrooms': 'maxBedrooms',
  'min-bathrooms': 'minBathrooms',
  'max-bathrooms': 'maxBathrooms',
  'min-build-size': 'minBuildSize',
  'max-build-size': 'maxBuildSize',
  'min-plot-size': 'minPlotSize',
  'max-plot-size': 'maxPlotSize',
  'reference': 'reference',
  'sort': 'sortBy',
  'page': 'page',
  'limit': 'limit',
};

const NUMERIC_KEYS = new Set([
  'locationId', 'propertyTypeId', 'minPrice', 'maxPrice',
  'minBedrooms', 'maxBedrooms', 'minBathrooms', 'maxBathrooms',
  'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize',
  'page', 'limit',
]);

export function parsePrefilledFilters(root: HTMLElement = document.documentElement): SearchFilters {
  const filters: SearchFilters = {};
  const elements = root.querySelectorAll<HTMLElement>('[data-spw-location], [data-spw-listing-type], [data-spw-property-type], [data-spw-min-price], [data-spw-max-price], [data-spw-min-bedrooms], [data-spw-max-bedrooms], [data-spw-sort], [data-spw-limit]');

  for (const el of elements) {
    for (const attr of el.attributes) {
      if (!attr.name.startsWith('data-spw-') || attr.name.startsWith('data-spw-lock-')) continue;
      const key = attr.name.slice(9);
      const filterKey = ATTR_MAP[key];
      if (!filterKey) continue;
      (filters as Record<string, unknown>)[filterKey] = coerce(filterKey, attr.value);
    }
  }

  const featuresEl = root.querySelector<HTMLElement>('[data-spw-features]');
  if (featuresEl) {
    const raw = featuresEl.getAttribute('data-spw-features');
    if (raw) {
      filters.features = raw.split(',').map(Number).filter(Boolean);
    }
  }

  return filters;
}

export function parseLockedFilters(root: HTMLElement = document.documentElement): LockedFilters {
  const locked: LockedFilters = {};
  const elements = root.querySelectorAll<HTMLElement>('[data-spw-lock-location], [data-spw-lock-listing-type], [data-spw-lock-property-type], [data-spw-lock-min-price], [data-spw-lock-max-price], [data-spw-lock-min-bedrooms], [data-spw-lock-max-bedrooms]');

  for (const el of elements) {
    for (const attr of el.attributes) {
      if (!attr.name.startsWith('data-spw-lock-')) continue;
      const key = attr.name.slice(14);
      const filterKey = ATTR_MAP[key];
      if (!filterKey) continue;
      (locked as Record<string, unknown>)[filterKey] = coerce(filterKey, attr.value);
    }
  }

  const featuresEl = root.querySelector<HTMLElement>('[data-spw-lock-features]');
  if (featuresEl) {
    const raw = featuresEl.getAttribute('data-spw-lock-features');
    if (raw) {
      locked.features = raw.split(',').map(Number).filter(Boolean);
    }
  }

  return locked;
}

export function parseStandaloneConfig(el: HTMLElement): {
  isStandalone: boolean;
  filters: SearchFilters;
  locked: LockedFilters;
} {
  const isStandalone = el.hasAttribute('data-spw-standalone');
  if (!isStandalone) return { isStandalone: false, filters: {}, locked: {} };

  return {
    isStandalone: true,
    filters: parsePrefilledFilters(el),
    locked: parseLockedFilters(el),
  };
}

function coerce(key: string, value: string): string | number {
  if (NUMERIC_KEYS.has(key)) {
    const n = Number(value);
    return isNaN(n) ? value as unknown as number : n;
  }
  return value;
}
