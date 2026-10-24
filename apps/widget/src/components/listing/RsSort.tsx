import { useCallback, useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useFilters } from '@/hooks/useFilters';
import { useConfig } from '@/hooks/useConfig';
import RsCustomSelect from '@/components/search/RsCustomSelect';
import type { SortOption } from '@/types';

// The same choices as Resales' "Sort By" (agency and commission sorts left out).
const ALL_SORT_OPTIONS: { value: SortOption; labelKey: string; fallback: string }[] = [
  { value: 'create_date_desc', labelKey: 'sort_newest', fallback: 'Most Recently Listed' },
  { value: 'create_date', labelKey: 'sort_oldest', fallback: 'Least Recently Listed' },
  { value: 'write_date_desc', labelKey: 'sort_recently_updated', fallback: 'Most Up To Date' },
  { value: 'write_date', labelKey: 'sort_oldest_updated', fallback: 'Least Up To Date' },
  { value: 'list_price', labelKey: 'sort_price_asc', fallback: 'Price: Low to High' },
  { value: 'list_price_desc', labelKey: 'sort_price_desc', fallback: 'Price: High to Low' },
  { value: 'ref_desc', labelKey: 'sort_ref_desc', fallback: 'Ref (Desc)' },
  { value: 'ref_asc', labelKey: 'sort_ref_asc', fallback: 'Ref (Asc)' },
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

  // No sort picked yet: the site's default, or the first offered choice when
  // the default isn't offered.
  const defaultSort = config.defaultSort || 'create_date_desc';
  const offered = (v: string) => sortOptions.some((o) => o.value === v);
  const current = filters.sortBy && offered(filters.sortBy)
    ? filters.sortBy
    : offered(defaultSort) ? defaultSort : sortOptions[0]?.value;

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
        value={current}
        onChange={handleChange}
        class="rs-sort__select"
      />
    </div>
  );
}
