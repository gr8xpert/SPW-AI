import { useCallback, useMemo } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import RsCustomSelect from './RsCustomSelect';

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

const DEFAULT_SALE_PRICES = [50000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 600000, 750000, 1000000, 1500000, 2000000, 3000000, 5000000];

export default function RsPrice({ variation = 1 }: Props) {
  const config = useConfig();
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const locked = isLocked('minPrice');
  const minLabel = t('price_min', 'Min Price');
  const maxLabel = t('price_max', 'Max Price');

  const priceOptions = useMemo(() => {
    const opts = config.priceOptions;
    if (!opts || typeof opts !== 'object') return DEFAULT_SALE_PRICES;
    const lt = filters.listingType || 'sale';
    return opts[lt] || opts['sale'] || DEFAULT_SALE_PRICES;
  }, [config.priceOptions, filters.listingType]);

  const handleMin = useCallback((value: string) => {
    const num = value ? Number(value) : undefined as unknown as number;
    setFilter('minPrice', num);
    if (num && filters.maxPrice && filters.maxPrice <= num) {
      setFilter('maxPrice', undefined as unknown as number);
    }
  }, [setFilter, filters.maxPrice]);

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
    const rangeOptions = useMemo(() => [
      { value: '0-0', label: t('price_min', 'Any Price') },
      ...PRICE_RANGES.map(r => ({
        value: `${r.min}-${r.max}`,
        label: `${formatPrice(r.min)} – ${r.max > 0 ? formatPrice(r.max) : `${formatPrice(r.min)}+`}`,
      })),
    ], [formatPrice, t]);

    return (
      <div class={`rs_price rs-field${locked ? ' rs-field--locked' : ''}`}>
        <RsCustomSelect
          options={rangeOptions}
          value={currentKey}
          onChange={(v) => {
            if (v === '0-0') {
              handleMin('');
              handleMax('');
            } else {
              const [lo, hi] = v.split('-');
              handleMin(lo);
              if (Number(hi) > 0) handleMax(hi); else handleMax('');
            }
          }}
          placeholder={t('price_min', 'Any Price')}
          disabled={locked}
        />
      </div>
    );
  }

  if (variation === 4) {
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

  const minVal = filters.minPrice;
  const maxOptions = minVal
    ? priceOptions.filter(v => v > minVal)
    : priceOptions;

  const minOptions = useMemo(() => [
    { value: '', label: minLabel },
    ...priceOptions.map(v => ({ value: String(v), label: formatPrice(v) })),
  ], [priceOptions, formatPrice, minLabel]);

  const maxOpts = useMemo(() => [
    { value: '', label: maxLabel },
    ...maxOptions.map(v => ({ value: String(v), label: formatPrice(v) })),
  ], [maxOptions, formatPrice, maxLabel]);

  return (
    <div class={`rs_price rs-field${locked ? ' rs-field--locked' : ''}`}>
      <div class="rs-range-row">
        <RsCustomSelect
          options={minOptions}
          value={String(minVal ?? '')}
          onChange={handleMin}
          placeholder={minLabel}
          disabled={locked}
        />
        <span class="rs-range-sep">–</span>
        <RsCustomSelect
          options={maxOpts}
          value={String(filters.maxPrice ?? '')}
          onChange={handleMax}
          placeholder={maxLabel}
          disabled={locked}
        />
      </div>
    </div>
  );
}
