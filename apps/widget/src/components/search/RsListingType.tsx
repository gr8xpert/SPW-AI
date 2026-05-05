import { useCallback, useMemo } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useDragScroll } from '@/hooks/useDragScroll';
import RsCustomSelect from './RsCustomSelect';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

const ALL_LISTING_TYPES = [
  { value: '', labelKey: 'listing_type_all', fallback: 'All' },
  { value: 'sale', labelKey: 'listing_type_sale', fallback: 'Sale' },
  { value: 'development', labelKey: 'listing_type_development', fallback: 'New Dev' },
  { value: 'offplan', labelKey: 'listing_type_offplan', fallback: 'Off Plan' },
  { value: 'rent', labelKey: 'listing_type_rent', fallback: 'Rent' },
  { value: 'holiday_rent', labelKey: 'listing_type_holiday', fallback: 'Holiday Rent' },
] as const;

export default function RsListingType({ variation = 1 }: Props) {
  const config = useConfig();
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const locked = isLocked('listingType');
  const current = filters.listingType ?? '';

  const LISTING_TYPES = useMemo(() => {
    const enabled = config.enabledListingTypes;
    if (!enabled || !Array.isArray(enabled) || enabled.length === 0) return ALL_LISTING_TYPES;
    return ALL_LISTING_TYPES.filter(lt => lt.value === '' || enabled.includes(lt.value));
  }, [config.enabledListingTypes]);

  const handleChange = useCallback((value: string) => {
    setFilter('listingType', value || undefined);
  }, [setFilter]);

  const handleTabChange = useCallback((value: string) => {
    setFilter('listingType', value || undefined);
    setTimeout(() => window.RealtySoft?.search(), 0);
  }, [setFilter]);

  if (variation === 3) {
    return (
      <div class={`rs_listing_type${locked ? ' rs-field--locked' : ''}`}>
        <div class="rs-radio-group">
          {LISTING_TYPES.map(lt => (
            <label key={lt.value} class={`rs-radio${current === lt.value ? ' rs-radio--active' : ''}`}>
              <input
                type="radio"
                name="rs-listing-type"
                value={lt.value}
                checked={current === lt.value}
                onChange={() => handleChange(lt.value)}
                disabled={locked}
              />
              <span class="rs-radio__label">{t(lt.labelKey, lt.fallback)}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  const selectOptions = useMemo(() =>
    LISTING_TYPES.map(lt => ({ value: lt.value, label: t(lt.labelKey, lt.fallback) })),
  [t]);

  if (variation === 2) {
    return (
      <div class={`rs_listing_type rs-field${locked ? ' rs-field--locked' : ''}`}>
        <RsCustomSelect
          options={selectOptions}
          value={current}
          onChange={handleChange}
          disabled={locked}
        />
      </div>
    );
  }

  const drag = useDragScroll();

  return (
    <div class={`rs_listing_type${locked ? ' rs-field--locked' : ''}`}>
      <div class="rs-btn-group" ref={drag.ref} {...drag.handlers}>
        {LISTING_TYPES.map(lt => (
          <button
            key={lt.value}
            type="button"
            class={`rs-btn-group__item${current === lt.value ? ' rs-btn-group__item--active' : ''}`}
            onClick={() => handleTabChange(lt.value)}
            disabled={locked}
          >
            {t(lt.labelKey, lt.fallback)}
          </button>
        ))}
      </div>
    </div>
  );
}
