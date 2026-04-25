import { useState, useMemo, useCallback } from 'preact/hooks';
import { useFilters } from '@/hooks/useFilters';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
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
        <div class="rs-modal-backdrop rs-backdrop-enter" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div class="rs-modal-content rs-modal-enter">
            <div class="rs-modal-header">
              <span class="rs-modal-header__title">{t('features_label', 'Features')}</span>
              <button type="button" class="rs-modal-header__close" onClick={() => setModalOpen(false)}>
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
              <button type="button" class="rs-reset-btn" onClick={() => setModalOpen(false)}>
                {t('close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
