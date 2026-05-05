import { useState, useMemo, useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsFeaturesModal from './RsFeaturesModal';
import type { Feature } from '@/types';

interface Props {
  variation?: number;
  [key: string]: unknown;
}

export default function RsFeatures({ variation = 1 }: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const features = useSelector(selectors.getFeatures);
  const locked = isLocked('features');
  const selected = filters.features ?? [];
  const label = t('features_label', 'Features');

  const toggle = useCallback((id: number) => {
    const next = selected.includes(id)
      ? selected.filter(f => f !== id)
      : [...selected, id];
    setFilter('features', next.length ? next : undefined as unknown as number[]);
  }, [selected, setFilter]);

  const clearAll = useCallback(() => {
    setFilter('features', undefined as unknown as number[]);
  }, [setFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Feature[]>();
    for (const f of features) {
      const cat = f.category || t('features_label', 'Features');
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
    }
    return map;
  }, [features, t]);

  if (variation === 1) return <ModalVariation grouped={grouped} selected={selected} toggle={toggle} label={label} locked={locked} clearAll={clearAll} />;
  if (variation === 3) return <TagsVariation features={features} selected={selected} toggle={toggle} locked={locked} />;

  return (
    <div class={`rs_features${locked ? ' rs-field--locked' : ''}`}>
      <label class="rs-field__label">{label}</label>
      <div class="rs-features-grid">
        {features.map(f => (
          <label key={f.id} class="rs-checkbox">
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={() => toggle(f.id)}
              disabled={locked}
            />
            <span>{f.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function ModalVariation({ grouped, selected, toggle, label, locked, clearAll }: {
  grouped: Map<string, Feature[]>;
  selected: number[];
  toggle: (id: number) => void;
  label: string;
  locked: boolean;
  clearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.length;

  const openModal = useCallback(() => {
    if (locked) return;
    setOpen(true);
  }, [locked]);

  return (
    <div class={`rs_features${locked ? ' rs-field--locked' : ''}`}>
      <button
        type="button"
        class="rs-select"
        onClick={openModal}
        style="text-align: left"
      >
        {count > 0 ? `${label} (${count})` : label}
      </button>

      {open && (
        <RsFeaturesModal
          grouped={grouped}
          selected={selected}
          toggle={toggle}
          clearAll={clearAll}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function TagsVariation({ features, selected, toggle, locked }: {
  features: Feature[];
  selected: number[];
  toggle: (id: number) => void;
  locked: boolean;
}) {
  return (
    <div class={`rs_features rs-tags${locked ? ' rs-field--locked' : ''}`}>
      {features.map(f => (
        <button
          key={f.id}
          type="button"
          class={`rs-tag rs-tag-enter${selected.includes(f.id) ? ' rs-tag--active' : ''}`}
          onClick={() => toggle(f.id)}
          disabled={locked}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}
