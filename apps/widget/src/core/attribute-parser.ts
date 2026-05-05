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
  'min-terrace-size': 'minTerraceSize',
  'max-terrace-size': 'maxTerraceSize',
  'reference': 'reference',
  'sort': 'sortBy',
  'page': 'page',
  'limit': 'limit',
};

const NUMERIC_KEYS = new Set([
  'locationId', 'propertyTypeId', 'minPrice', 'maxPrice',
  'minBedrooms', 'maxBedrooms', 'minBathrooms', 'maxBathrooms',
  'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize', 'minTerraceSize', 'maxTerraceSize',
  'page', 'limit',
]);

export function parsePrefilledFilters(root: HTMLElement = document.documentElement): SearchFilters {
  const filters: SearchFilters = {};
  const elements = root.querySelectorAll<HTMLElement>('[data-spm-location], [data-spm-listing-type], [data-spm-property-type], [data-spm-min-price], [data-spm-max-price], [data-spm-min-bedrooms], [data-spm-max-bedrooms], [data-spm-sort], [data-spm-limit]');

  for (const el of elements) {
    for (const attr of el.attributes) {
      if (!attr.name.startsWith('data-spm-') || attr.name.startsWith('data-spm-lock-')) continue;
      const key = attr.name.slice(9);
      const filterKey = ATTR_MAP[key];
      if (!filterKey) continue;
      (filters as Record<string, unknown>)[filterKey] = coerce(filterKey, attr.value);
    }
  }

  const featuresEl = root.querySelector<HTMLElement>('[data-spm-features]');
  if (featuresEl) {
    const raw = featuresEl.getAttribute('data-spm-features');
    if (raw) {
      filters.features = raw.split(',').map(Number).filter(Boolean);
    }
  }

  return filters;
}

export function parseLockedFilters(root: HTMLElement = document.documentElement): LockedFilters {
  const locked: LockedFilters = {};
  const elements = root.querySelectorAll<HTMLElement>('[data-spm-lock-location], [data-spm-lock-listing-type], [data-spm-lock-property-type], [data-spm-lock-min-price], [data-spm-lock-max-price], [data-spm-lock-min-bedrooms], [data-spm-lock-max-bedrooms]');

  for (const el of elements) {
    for (const attr of el.attributes) {
      if (!attr.name.startsWith('data-spm-lock-')) continue;
      const key = attr.name.slice(14);
      const filterKey = ATTR_MAP[key];
      if (!filterKey) continue;
      (locked as Record<string, unknown>)[filterKey] = coerce(filterKey, attr.value);
    }
  }

  const featuresEl = root.querySelector<HTMLElement>('[data-spm-lock-features]');
  if (featuresEl) {
    const raw = featuresEl.getAttribute('data-spm-lock-features');
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
  const isStandalone = el.hasAttribute('data-spm-standalone');
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
