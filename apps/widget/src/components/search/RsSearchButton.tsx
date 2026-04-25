import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsSearchButton() {
  const { t } = useLabels();
  const isSearching = useSelector(selectors.isSearchLoading);

  const handleClick = useCallback(() => {
    if (window.RealtySoft) {
      window.RealtySoft.search();
    }
  }, []);

  return (
    <div class="rs_search_button">
      <button
        type="button"
        class="rs-search-btn"
        onClick={handleClick}
        disabled={isSearching}
      >
        {isSearching && (
          <svg width="16" height="16" viewBox="0 0 16 16" class="rs-spinner" style="animation:spin 1s linear infinite">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="28" stroke-dashoffset="8" />
          </svg>
        )}
        {t('search_button', 'Search')}
      </button>
    </div>
  );
}
