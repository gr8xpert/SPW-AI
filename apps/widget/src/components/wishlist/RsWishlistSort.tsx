import { useLabels } from '@/hooks/useLabels';
import { useWishlistState, wishlistActions } from '@/hooks/useWishlistState';

type SortValue = 'price_asc' | 'price_desc' | 'date_added';

interface Props {
  value?: SortValue;
  onChange?: (value: SortValue) => void;
  [key: string]: unknown;
}

const SORT_OPTIONS: { value: SortValue; labelKey: string; fallback: string }[] = [
  { value: 'date_added', labelKey: 'sort_date_desc', fallback: 'Recently Added' },
  { value: 'price_asc', labelKey: 'sort_price_asc', fallback: 'Price: Low to High' },
  { value: 'price_desc', labelKey: 'sort_price_desc', fallback: 'Price: High to Low' },
];

export default function RsWishlistSort(_props: Props) {
  const { t } = useLabels();
  const { sortBy } = useWishlistState();

  return (
    <div class="rs-field rs-field--inline">
      <label class="rs-field__label">{t('sort_label', 'Sort by')}</label>
      <select
        class="rs-select"
        value={sortBy}
        onChange={(e) => wishlistActions.setSortBy((e.target as HTMLSelectElement).value as SortValue)}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey, opt.fallback)}
          </option>
        ))}
      </select>
    </div>
  );
}
