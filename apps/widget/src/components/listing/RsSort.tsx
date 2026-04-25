import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useFilters } from '@/hooks/useFilters';
import type { SortOption } from '@/types';

const SORT_OPTIONS: { value: SortOption; labelKey: string; fallback: string }[] = [
  { value: 'featured', labelKey: 'sort_featured', fallback: 'Featured' },
  { value: 'price_asc', labelKey: 'sort_price_asc', fallback: 'Price: Low to High' },
  { value: 'price_desc', labelKey: 'sort_price_desc', fallback: 'Price: High to Low' },
  { value: 'date_asc', labelKey: 'sort_date_asc', fallback: 'Oldest First' },
  { value: 'date_desc', labelKey: 'sort_date_desc', fallback: 'Newest First' },
];

export default function RsSort() {
  const { t } = useLabels();
  const { filters, setFilter } = useFilters();

  const handleChange = useCallback((e: Event) => {
    const value = (e.target as HTMLSelectElement).value as SortOption;
    setFilter('sortBy', value);
    window.RealtySoft?.search();
  }, [setFilter]);

  return (
    <div class="rs-sort">
      <label class="rs-sort__label" for="rs-sort-select">
        {t('sort_label', 'Sort by')}
      </label>
      <select
        id="rs-sort-select"
        class="rs-select rs-sort__select"
        value={filters.sortBy || ''}
        onChange={handleChange}
      >
        {SORT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey, opt.fallback)}
          </option>
        ))}
      </select>
    </div>
  );
}
