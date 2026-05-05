import { useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

export default function RsPlotSize({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const locked = isLocked('minPlotSize');
  const label = t('plot_size_label', 'Plot Size (m²)');

  const handleMin = useCallback((value: string) => {
    setFilter('minPlotSize', value ? Number(value) : undefined as unknown as number);
  }, [setFilter]);

  const handleMax = useCallback((value: string) => {
    setFilter('maxPlotSize', value ? Number(value) : undefined as unknown as number);
  }, [setFilter]);

  if (variation === 3) {
    const min = filters.minPlotSize ?? 0;
    const max = filters.maxPlotSize ?? 10000;
    const absMin = 0;
    const absMax = 10000;
    const leftPct = ((min - absMin) / (absMax - absMin)) * 100;
    const rightPct = ((max - absMin) / (absMax - absMin)) * 100;

    return (
      <div class={`rs_plot_size rs-field${locked ? ' rs-field--locked' : ''}`}>
        <label class="rs-field__label">{label}</label>
        <div class="rs-range-slider">
          <div class="rs-range-slider__track" />
          <div class="rs-range-slider__fill" style={`left:${leftPct}%;width:${rightPct - leftPct}%`} />
          <input
            type="range"
            min={absMin}
            max={absMax}
            step={50}
            value={min}
            onInput={(e) => handleMin((e.target as HTMLInputElement).value)}
            disabled={locked}
          />
          <input
            type="range"
            min={absMin}
            max={absMax}
            step={50}
            value={max}
            onInput={(e) => handleMax((e.target as HTMLInputElement).value)}
            disabled={locked}
          />
        </div>
        <div class="rs-range-slider__values">
          <span>{min} m²</span>
          <span>{max >= absMax ? `${absMax}+ m²` : `${max} m²`}</span>
        </div>
      </div>
    );
  }

  if (variation === 2) {
    return (
      <div class={`rs_plot_size rs-field${locked ? ' rs-field--locked' : ''}`}>
        <label class="rs-field__label">{label}</label>
        <div class="rs-range-row">
          <input
            type="number"
            class="rs-input"
            placeholder={t('price_min', 'Min')}
            value={filters.minPlotSize ?? ''}
            onInput={(e) => handleMin((e.target as HTMLInputElement).value)}
            min="0"
            disabled={locked}
          />
          <span class="rs-range-sep">–</span>
          <input
            type="number"
            class="rs-input"
            placeholder={t('price_max', 'Max')}
            value={filters.maxPlotSize ?? ''}
            onInput={(e) => handleMax((e.target as HTMLInputElement).value)}
            min="0"
            disabled={locked}
          />
        </div>
      </div>
    );
  }

  return (
    <div class={`rs_plot_size rs-field${locked ? ' rs-field--locked' : ''}`}>
      <label class="rs-field__label">{label}</label>
      <input
        type="number"
        class="rs-input"
        placeholder={label}
        value={filters.minPlotSize ?? ''}
        onInput={(e) => handleMin((e.target as HTMLInputElement).value)}
        min="0"
        disabled={locked}
      />
    </div>
  );
}
