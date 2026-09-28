import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { useMatchCount } from '@/hooks/useMatchCount';

export default function RsSearchButton() {
  const { t } = useLabels();
  const isSearching = useSelector(selectors.isSearchLoading);
  // What the filters on screen would find, not what the last search found.
  const totalCount = useMatchCount();

  const handleClick = useCallback(() => {
    if (window.RealtySoft) {
      window.RealtySoft.search(undefined, { navigate: true });
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
          <svg width="16" height="16" viewBox="0 0 16 16" class="rs-spinner">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="28" stroke-dashoffset="8" />
          </svg>
        )}
        {t('search_button', 'Search')}
        {/* Shown as soon as the number is known, zero included: "Search 0"
            tells the visitor these filters find nothing before they press it. */}
        {totalCount !== null && !isSearching && (
          <span class="rs-search-btn__count">{totalCount}</span>
        )}
      </button>
    </div>
  );
}
