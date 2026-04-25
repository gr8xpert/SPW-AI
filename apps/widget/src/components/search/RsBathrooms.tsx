import { useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

const OPTIONS = ['', '1', '2', '3', '4', '5'] as const;

export default function RsBathrooms({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const locked = isLocked('minBathrooms');
  const label = t('bathrooms_label', 'Bathrooms');
  const anyLabel = t('bathrooms_any', 'Any');
  const current = filters.minBathrooms;

  const handleChange = useCallback((value: string) => {
    setFilter('minBathrooms', value ? Number(value) : undefined as unknown as number);
  }, [setFilter]);

  const displayLabel = (v: string) => v === '' ? anyLabel : v === '5' ? '5+' : v;

  if (variation === 2) {
    return (
      <div class={`rs_bathrooms${locked ? ' rs-field--locked' : ''}`}>
        <div class="rs-btn-group">
          {OPTIONS.map(v => (
            <button
              key={v}
              type="button"
              class={`rs-btn-group__item${(current?.toString() ?? '') === v ? ' rs-btn-group__item--active' : ''}`}
              onClick={() => handleChange(v)}
              disabled={locked}
            >
              {displayLabel(v)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (variation === 3) {
    return (
      <div class={`rs_bathrooms rs-field${locked ? ' rs-field--locked' : ''}`}>
        <label class="rs-field__label">{label}</label>
        <div class="rs-range-row">
          <input
            type="number"
            class="rs-input rs-input--sm"
            placeholder={t('price_min', 'Min')}
            value={filters.minBathrooms ?? ''}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              setFilter('minBathrooms', v ? Number(v) : undefined as unknown as number);
            }}
            min="0"
            disabled={locked}
          />
          <span class="rs-range-sep">–</span>
          <input
            type="number"
            class="rs-input rs-input--sm"
            placeholder={t('price_max', 'Max')}
            value={filters.maxBathrooms ?? ''}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              setFilter('maxBathrooms', v ? Number(v) : undefined as unknown as number);
            }}
            min="0"
            disabled={locked}
          />
        </div>
      </div>
    );
  }

  return (
    <div class={`rs_bathrooms rs-field${locked ? ' rs-field--locked' : ''}`}>
      <label class="rs-field__label">{label}</label>
      <select
        class="rs-select"
        value={current ?? ''}
        onChange={(e) => handleChange((e.target as HTMLSelectElement).value)}
        disabled={locked}
      >
        <option value="">{anyLabel}</option>
        {OPTIONS.filter(v => v !== '').map(v => (
          <option key={v} value={v}>{v === '5' ? '5+' : v}</option>
        ))}
      </select>
    </div>
  );
}
