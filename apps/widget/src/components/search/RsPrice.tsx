import { useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

const PRICE_RANGES = [
  { min: 0, max: 100000 },
  { min: 100000, max: 250000 },
  { min: 250000, max: 500000 },
  { min: 500000, max: 1000000 },
  { min: 1000000, max: 2500000 },
  { min: 2500000, max: 0 },
];

export default function RsPrice({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const locked = isLocked('minPrice');
  const minLabel = t('price_min', 'Min Price');
  const maxLabel = t('price_max', 'Max Price');

  const handleMin = useCallback((value: string) => {
    setFilter('minPrice', value ? Number(value) : undefined as unknown as number);
  }, [setFilter]);

  const handleMax = useCallback((value: string) => {
    setFilter('maxPrice', value ? Number(value) : undefined as unknown as number);
  }, [setFilter]);

  if (variation === 2) {
    const min = filters.minPrice ?? 0;
    const max = filters.maxPrice ?? 10000000;
    const absMin = 0;
    const absMax = 10000000;
    const leftPct = ((min - absMin) / (absMax - absMin)) * 100;
    const rightPct = ((max - absMin) / (absMax - absMin)) * 100;

    return (
      <div class={`rs_price rs-field${locked ? ' rs-field--locked' : ''}`}>
        <div class="rs-range-slider">
          <div class="rs-range-slider__track" />
          <div class="rs-range-slider__fill" style={`left:${leftPct}%;width:${rightPct - leftPct}%`} />
          <input
            type="range"
            min={absMin}
            max={absMax}
            step={10000}
            value={min}
            onInput={(e) => handleMin((e.target as HTMLInputElement).value)}
            disabled={locked}
          />
          <input
            type="range"
            min={absMin}
            max={absMax}
            step={10000}
            value={max}
            onInput={(e) => handleMax((e.target as HTMLInputElement).value)}
            disabled={locked}
          />
        </div>
        <div class="rs-range-slider__values">
          <span>{formatPrice(min)}</span>
          <span>{max >= absMax ? `${formatPrice(absMax)}+` : formatPrice(max)}</span>
        </div>
      </div>
    );
  }

  if (variation === 3) {
    const currentKey = `${filters.minPrice ?? 0}-${filters.maxPrice ?? 0}`;
    return (
      <div class={`rs_price rs-field${locked ? ' rs-field--locked' : ''}`}>
        <select
          class="rs-select"
          value={currentKey}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            if (v === '0-0') {
              handleMin('');
              handleMax('');
            } else {
              const [lo, hi] = v.split('-');
              handleMin(lo);
              if (Number(hi) > 0) handleMax(hi); else handleMax('');
            }
          }}
          disabled={locked}
        >
          <option value="0-0">{t('price_min', 'Any Price')}</option>
          {PRICE_RANGES.map(r => (
            <option key={`${r.min}-${r.max}`} value={`${r.min}-${r.max}`}>
              {formatPrice(r.min)} – {r.max > 0 ? formatPrice(r.max) : `${formatPrice(r.min)}+`}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div class={`rs_price rs-field${locked ? ' rs-field--locked' : ''}`}>
      <div class="rs-range-row">
        <input
          type="number"
          class="rs-input"
          placeholder={minLabel}
          value={filters.minPrice ?? ''}
          onInput={(e) => handleMin((e.target as HTMLInputElement).value)}
          min="0"
          disabled={locked}
        />
        <span class="rs-range-sep">–</span>
        <input
          type="number"
          class="rs-input"
          placeholder={maxLabel}
          value={filters.maxPrice ?? ''}
          onInput={(e) => handleMax((e.target as HTMLInputElement).value)}
          min="0"
          disabled={locked}
        />
      </div>
    </div>
  );
}
