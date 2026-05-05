import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import RsLocation from '@/components/search/RsLocation';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsPrice from '@/components/search/RsPrice';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsResetButton from '@/components/search/RsResetButton';
import RsReference from '@/components/search/RsReference';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsBathrooms from '@/components/search/RsBathrooms';
import RsBuiltArea from '@/components/search/RsBuiltArea';
import RsPlotSize from '@/components/search/RsPlotSize';
import RsListingType from '@/components/search/RsListingType';
import RsFeatures from '@/components/search/RsFeatures';
import { useLabels } from '@/hooks/useLabels';

export default function SearchTemplate02() {
  const [moreOpen, setMoreOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const { t } = useLabels();

  const toggle = useCallback(() => setMoreOpen(v => !v), []);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setMoreOpen(false);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [moreOpen]);

  return (
    <div class="rs-search-template-02">
      <div class="rs-search-row rs-search-row--inline">
        <RsLocation variation={1} />
        <RsPropertyType variation={2} />
        <RsPrice variation={1} />
        <div class="rs_more_filters">
          <button
            ref={btnRef}
            type="button"
            class={`rs-more-filters-btn${moreOpen ? ' rs-more-filters-btn--active' : ''}`}
            onClick={toggle}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {t('more_filters', 'More Filters')}
            <svg class={`rs-more-filters-chevron${moreOpen ? ' rs-more-filters-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <RsSearchButton />
        <RsResetButton />
      </div>

      {moreOpen && (
        <div ref={panelRef} class="rs-more-filters-panel">
          <div class="rs-more-filters-section">
            <RsReference />
          </div>
          <div class="rs-more-filters-section rs-more-filters-row">
            <RsBedrooms variation={1} />
            <RsBathrooms variation={1} />
          </div>
          <div class="rs-more-filters-section rs-more-filters-row">
            <RsBuiltArea variation={2} />
            <RsPlotSize variation={2} />
          </div>
          <div class="rs-more-filters-section">
            <RsListingType variation={3} />
          </div>
          <div class="rs-more-filters-section">
            <RsFeatures variation={1} />
          </div>
        </div>
      )}

      <div class="rs-t02-mobile-actions">
        <RsSearchButton />
        <RsResetButton />
      </div>
    </div>
  );
}
