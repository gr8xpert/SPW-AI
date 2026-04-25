import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useFilters } from '@/hooks/useFilters';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { SearchFilters } from '@/types';

const FILTER_LABELS: Record<string, { labelKey: string; fallback: string }> = {
  listingType: { labelKey: 'filter_listing_type', fallback: 'Listing Type' },
  locationId: { labelKey: 'filter_location', fallback: 'Location' },
  propertyTypeId: { labelKey: 'filter_property_type', fallback: 'Property Type' },
  minPrice: { labelKey: 'filter_min_price', fallback: 'Min Price' },
  maxPrice: { labelKey: 'filter_max_price', fallback: 'Max Price' },
  minBedrooms: { labelKey: 'filter_min_bedrooms', fallback: 'Min Beds' },
  maxBedrooms: { labelKey: 'filter_max_bedrooms', fallback: 'Max Beds' },
  minBathrooms: { labelKey: 'filter_min_bathrooms', fallback: 'Min Baths' },
  maxBathrooms: { labelKey: 'filter_max_bathrooms', fallback: 'Max Baths' },
  minBuildSize: { labelKey: 'filter_min_build_size', fallback: 'Min Build' },
  maxBuildSize: { labelKey: 'filter_max_build_size', fallback: 'Max Build' },
  minPlotSize: { labelKey: 'filter_min_plot_size', fallback: 'Min Plot' },
  maxPlotSize: { labelKey: 'filter_max_plot_size', fallback: 'Max Plot' },
  query: { labelKey: 'filter_keyword', fallback: 'Keyword' },
  reference: { labelKey: 'filter_reference', fallback: 'Reference' },
};

const SKIP_KEYS = new Set(['page', 'limit', 'sortBy', 'bounds', 'lat', 'lng', 'radius']);

export default function RsActiveFilters() {
  const { t } = useLabels();
  const { filters, resetFilters, setFilter, isLocked } = useFilters();
  const locations = useSelector(selectors.getLocations);
  const propertyTypes = useSelector(selectors.getPropertyTypes);

  const removeFilter = useCallback((key: keyof SearchFilters) => {
    setFilter(key, undefined as never);
    window.RealtySoft?.search();
  }, [setFilter]);

  const handleClearAll = useCallback(() => {
    resetFilters();
    window.RealtySoft?.search();
  }, [resetFilters]);

  const activeFilters: { key: keyof SearchFilters; label: string; value: string }[] = [];

  for (const [key, value] of Object.entries(filters)) {
    if (SKIP_KEYS.has(key)) continue;
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    if (isLocked(key as keyof SearchFilters)) continue;

    const meta = FILTER_LABELS[key];
    const label = meta ? t(meta.labelKey, meta.fallback) : key;
    let displayValue = String(value);

    if (key === 'locationId') {
      const loc = locations.find(l => l.id === value);
      displayValue = loc ? loc.name : String(value);
    } else if (key === 'propertyTypeId') {
      const pt = propertyTypes.find(p => p.id === value);
      displayValue = pt ? pt.name : String(value);
    } else if (key === 'features' && Array.isArray(value)) {
      displayValue = `${value.length} selected`;
    } else if (key === 'isFeatured') {
      displayValue = t('card_featured', 'Featured');
    }

    activeFilters.push({ key: key as keyof SearchFilters, label, value: displayValue });
  }

  if (activeFilters.length === 0) return null;

  return (
    <div class="rs-active-filters">
      <span class="rs-active-filters__label">{t('active_filters', 'Active filters')}:</span>
      <div class="rs-active-filters__tags">
        {activeFilters.map(f => (
          <span key={f.key} class="rs-active-filters__tag rs-tag-enter">
            <span class="rs-active-filters__tag-label">{f.label}:</span>
            <span class="rs-active-filters__tag-value">{f.value}</span>
            <button
              class="rs-active-filters__tag-remove"
              onClick={() => removeFilter(f.key)}
              aria-label={`Remove ${f.label}`}
              type="button"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ))}
      </div>
      <button
        class="rs-active-filters__clear"
        onClick={handleClearAll}
        type="button"
      >
        {t('clear_all', 'Clear All')}
      </button>
    </div>
  );
}
