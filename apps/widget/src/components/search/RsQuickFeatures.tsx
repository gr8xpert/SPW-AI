import { useState, useMemo, useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsFeaturesModal from './RsFeaturesModal';
import type { Feature } from '@/types';

interface Props {
  'feature-ids'?: string;
  [key: string]: unknown;
}

export default function RsQuickFeatures(props: Props) {
  const { filters, setFilter, isLocked } = useFilters();
  const { t } = useLabels();
  const config = useConfig();
  const allFeatures = useSelector(selectors.getFeatures);
  const locked = isLocked('features');
  const selected = filters.features ?? [];
  const [modalOpen, setModalOpen] = useState(false);

  const overrideIds = props['feature-ids'];
  const quickIds: number[] = useMemo(() => {
    if (overrideIds) return overrideIds.split(',').map(Number).filter(Boolean);
    return config.quickFeatureIds ?? [];
  }, [overrideIds, config.quickFeatureIds]);

  const quickFeatures = useMemo(() =>
    quickIds
      .map(id => allFeatures.find(f => f.id === id))
      .filter((f): f is Feature => f != null),
    [quickIds, allFeatures]
  );

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
    for (const f of allFeatures) {
      const cat = f.category || t('features_label', 'Features');
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
    }
    return map;
  }, [allFeatures, t]);

  if (!quickFeatures.length && !allFeatures.length) return null;

  return (
    <div class={`rs_quick_features${locked ? ' rs-field--locked' : ''}`}>
      <div class="rs-quick-features">
        {quickFeatures.map(f => (
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
        {allFeatures.length > quickFeatures.length && (
          <button
            type="button"
            class="rs-quick-features__link"
            onClick={() => setModalOpen(true)}
          >
            {t('advanced_search', 'Advanced Search')} &rarr;
          </button>
        )}
      </div>

      {modalOpen && (
        <RsFeaturesModal
          grouped={grouped}
          selected={selected}
          toggle={toggle}
          clearAll={clearAll}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
