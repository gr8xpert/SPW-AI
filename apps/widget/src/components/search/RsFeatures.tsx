import { useState, useMemo, useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
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

  const grouped = useMemo(() => {
    const map = new Map<string, Feature[]>();
    for (const f of features) {
      const cat = f.category || t('features_label', 'Features');
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
    }
    return map;
  }, [features, t]);

  if (variation === 1) return <ModalVariation grouped={grouped} selected={selected} toggle={toggle} label={label} locked={locked} t={t} />;
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

function ModalVariation({ grouped, selected, toggle, label, locked, t }: {
  grouped: Map<string, Feature[]>;
  selected: number[];
  toggle: (id: number) => void;
  label: string;
  locked: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.length;

  return (
    <div class={`rs_features${locked ? ' rs-field--locked' : ''}`}>
      <button
        type="button"
        class="rs-select"
        onClick={() => !locked && setOpen(true)}
        style="text-align: left"
      >
        {count > 0 ? `${label} (${count})` : label}
      </button>

      {open && (
        <div class="rs-modal-backdrop rs-backdrop-enter" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div class="rs-modal-content rs-modal-enter">
            <div class="rs-modal-header">
              <span class="rs-modal-header__title">{label}</span>
              <button type="button" class="rs-modal-header__close" onClick={() => setOpen(false)}>
                &times;
              </button>
            </div>
            <div class="rs-modal-body">
              <div class="rs-features-modal__categories">
                {Array.from(grouped.entries()).map(([cat, feats]) => (
                  <div key={cat}>
                    <div class="rs-features-modal__category-title">{cat}</div>
                    <div class="rs-features-grid">
                      {feats.map(f => (
                        <label key={f.id} class="rs-checkbox">
                          <input
                            type="checkbox"
                            checked={selected.includes(f.id)}
                            onChange={() => toggle(f.id)}
                          />
                          <span>{f.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div class="rs-modal-footer">
              <button type="button" class="rs-reset-btn" onClick={() => setOpen(false)}>
                {t('close', 'Close')}
              </button>
            </div>
          </div>
        </div>
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
