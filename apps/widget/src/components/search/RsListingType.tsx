import { useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

const LISTING_TYPES = [
  { value: '', labelKey: 'listing_type_all', fallback: 'All' },
  { value: 'sale', labelKey: 'listing_type_sale', fallback: 'Sale' },
  { value: 'rent', labelKey: 'listing_type_rent', fallback: 'Rent' },
  { value: 'holiday_rent', labelKey: 'listing_type_holiday', fallback: 'Holiday Rent' },
  { value: 'development', labelKey: 'listing_type_development', fallback: 'Development' },
] as const;

export default function RsListingType({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const locked = isLocked('listingType');
  const current = filters.listingType ?? '';

  const handleChange = useCallback((value: string) => {
    setFilter('listingType', value || undefined);
  }, [setFilter]);

  if (variation === 3) {
    return (
      <div class={`rs_listing_type${locked ? ' rs-field--locked' : ''}`}>
        <div class="rs-tabs">
          {LISTING_TYPES.map(lt => (
            <button
              key={lt.value}
              type="button"
              class={`rs-tabs__item${current === lt.value ? ' rs-tabs__item--active' : ''}`}
              onClick={() => handleChange(lt.value)}
              disabled={locked}
            >
              {t(lt.labelKey, lt.fallback)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (variation === 2) {
    return (
      <div class={`rs_listing_type rs-field${locked ? ' rs-field--locked' : ''}`}>
        <select
          class="rs-select"
          value={current}
          onChange={(e) => handleChange((e.target as HTMLSelectElement).value)}
          disabled={locked}
        >
          {LISTING_TYPES.map(lt => (
            <option key={lt.value} value={lt.value}>
              {t(lt.labelKey, lt.fallback)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div class={`rs_listing_type${locked ? ' rs-field--locked' : ''}`}>
      <div class="rs-btn-group">
        {LISTING_TYPES.map(lt => (
          <button
            key={lt.value}
            type="button"
            class={`rs-btn-group__item${current === lt.value ? ' rs-btn-group__item--active' : ''}`}
            onClick={() => handleChange(lt.value)}
            disabled={locked}
          >
            {t(lt.labelKey, lt.fallback)}
          </button>
        ))}
      </div>
    </div>
  );
}
