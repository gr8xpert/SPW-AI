import { useCallback } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
import { useFilters } from '@/hooks/useFilters';
import { selectors } from '@/core/selectors';

export default function RsPagination() {
  const currentPage = useSelector(selectors.getCurrentPage);
  const totalPages = useSelector(selectors.getTotalPages);
  const { t } = useLabels();
  const { setFilter } = useFilters();

  const goToPage = useCallback((page: number) => {
    if (page < 1 || page > totalPages) return;
    setFilter('page', page);
    window.RealtySoft?.search();
  }, [totalPages, setFilter]);

  if (totalPages <= 1) return null;

  const pages = buildPageRange(currentPage, totalPages);

  return (
    <nav class="rs-pagination" aria-label="Pagination">
      <button
        class="rs-pagination__btn rs-pagination__btn--prev"
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {t('pagination_prev', 'Previous')}
      </button>

      <div class="rs-pagination__pages">
        {pages.map((page, i) =>
          page === '...' ? (
            <span key={`ellipsis-${i}`} class="rs-pagination__ellipsis">&hellip;</span>
          ) : (
            <button
              key={page}
              class={`rs-pagination__page${page === currentPage ? ' rs-pagination__page--active' : ''}`}
              onClick={() => goToPage(page as number)}
              aria-label={`${t('pagination_page', 'Page')} ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
              type="button"
            >
              {page}
            </button>
          )
        )}
      </div>

      <button
        class="rs-pagination__btn rs-pagination__btn--next"
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        type="button"
      >
        {t('pagination_next', 'Next')}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </nav>
  );
}

function buildPageRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [1];

  if (current > 3) {
    pages.push('...');
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('...');
  }

  pages.push(total);

  return pages;
}
