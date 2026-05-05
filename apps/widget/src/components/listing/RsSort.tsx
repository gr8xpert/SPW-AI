import { useCallback, useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useFilters } from '@/hooks/useFilters';
import { useConfig } from '@/hooks/useConfig';
import RsCustomSelect from '@/components/search/RsCustomSelect';
import type { SortOption } from '@/types';

const ALL_SORT_OPTIONS: { value: SortOption; labelKey: string; fallback: string }[] = [
  { value: 'create_date_desc', labelKey: 'sort_newest', fallback: 'Newest Listings' },
  { value: 'create_date', labelKey: 'sort_oldest', fallback: 'Oldest Listings' },
  { value: 'write_date_desc', labelKey: 'sort_recently_updated', fallback: 'Recently Updated' },
  { value: 'write_date', labelKey: 'sort_oldest_updated', fallback: 'Oldest Updated' },
  { value: 'list_price', labelKey: 'sort_price_asc', fallback: 'Price: Low to High' },
  { value: 'list_price_desc', labelKey: 'sort_price_desc', fallback: 'Price: High to Low' },
  { value: 'is_featured_desc', labelKey: 'sort_featured', fallback: 'Featured First' },
  { value: 'location_id', labelKey: 'sort_location', fallback: 'By Location' },
];

export default function RsSort() {
  const { t } = useLabels();
  const config = useConfig();
  const { filters, setFilter } = useFilters();

  const sortOptions = useMemo(() => {
    const enabled = config.enabledSortOptions;
    if (!enabled || !Array.isArray(enabled) || enabled.length === 0) return ALL_SORT_OPTIONS;
    return ALL_SORT_OPTIONS.filter(opt => enabled.includes(opt.value));
  }, [config.enabledSortOptions]);

  const selectOptions = useMemo(() =>
    sortOptions.map(opt => ({ value: opt.value, label: t(opt.labelKey, opt.fallback) })),
    [sortOptions, t]
  );

  const handleChange = useCallback((value: string) => {
    setFilter('sortBy', value as SortOption);
    window.RealtySoft?.search();
  }, [setFilter]);

  return (
    <div class="rs-sort">
      <label class="rs-sort__label">
        {t('sort_label', 'Sort by')}
      </label>
      <RsCustomSelect
        options={selectOptions}
        value={filters.sortBy || 'create_date_desc'}
        onChange={handleChange}
        class="rs-sort__select"
      />
    </div>
  );
}
