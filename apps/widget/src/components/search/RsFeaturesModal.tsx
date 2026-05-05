import { useState, useMemo, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import type { Feature } from '@/types';

interface Props {
  grouped: Map<string, Feature[]>;
  selected: number[];
  toggle: (id: number) => void;
  clearAll: () => void;
  onClose: () => void;
}

export default function RsFeaturesModal({ grouped, selected, toggle, clearAll, onClose }: Props) {
  const { t } = useLabels();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const label = t('features_label', 'Features');

  const toggleAccordion = useCallback((cat: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const filteredGrouped = useMemo(() => {
    if (!search.trim()) return grouped;
    const q = search.toLowerCase();
    const result = new Map<string, Feature[]>();
    for (const [cat, feats] of grouped) {
      const matched = feats.filter(f => f.name.toLowerCase().includes(q));
      if (matched.length > 0) result.set(cat, matched);
    }
    return result;
  }, [grouped, search]);

  return (
    <div class="rs-modal-backdrop rs-backdrop-enter" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="rs-modal-content rs-modal-enter">
        <div class="rs-modal-header">
          <span class="rs-modal-header__title">{label}</span>
          <button type="button" class="rs-modal-header__close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div class="rs-features-modal__search">
          <input
            type="text"
            class="rs-input"
            placeholder={t('features_search', 'Search features...')}
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="rs-modal-body">
          <div class="rs-features-modal__categories">
            {Array.from(filteredGrouped.entries()).map(([cat, feats]) => {
              const isOpen = expanded.has(cat) || search.trim().length > 0;
              const catCount = feats.filter(f => selected.includes(f.id)).length;
              return (
                <div key={cat} class="rs-features-accordion">
                  <button
                    type="button"
                    class={`rs-features-accordion__trigger${isOpen ? ' rs-features-accordion__trigger--open' : ''}`}
                    onClick={() => toggleAccordion(cat)}
                  >
                    <svg class="rs-features-accordion__icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <line x1="7" y1="3" x2="7" y2="11" />
                      <line x1="3" y1="7" x2="11" y2="7" />
                    </svg>
                    <span>{cat}</span>
                    {catCount > 0 && <span class="rs-features-accordion__count">{catCount}</span>}
                  </button>
                  {isOpen && (
                    <div class="rs-features-accordion__body">
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
                  )}
                </div>
              );
            })}
            {filteredGrouped.size === 0 && (
              <div class="rs-features-modal__empty">{t('features_no_results', 'No features found')}</div>
            )}
          </div>
        </div>
        <div class="rs-modal-footer rs-modal-footer--split">
          <button type="button" class="rs-reset-btn" onClick={clearAll}>
            {t('clear', 'Clear')}
          </button>
          <button type="button" class="rs-search-btn" onClick={onClose}>
            {t('close', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
}
