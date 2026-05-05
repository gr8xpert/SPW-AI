import { useEffect, useRef } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
import { useFilters } from '@/hooks/useFilters';
import { selectors } from '@/core/selectors';
import PropertyCard from './PropertyCard';
import Skeleton from '@/components/common/Skeleton';

interface RsPropertyGridProps {
  variation?: number;
  columns?: string;
  template?: number;
  standalone?: string;
  [key: string]: unknown;
}

export default function RsPropertyGrid({ columns, template }: RsPropertyGridProps) {
  const results = useSelector(selectors.getResults);
  const isLoading = useSelector(selectors.isSearchLoading);
  const currentPage = useSelector(selectors.getCurrentPage);
  const { t } = useLabels();
  const { setFilter } = useFilters();
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  // On mount: check if we need to restore page from back navigation
  useEffect(() => {
    if (restoredRef.current) return;
    try {
      const raw = sessionStorage.getItem('spm_back_context');
      if (!raw) return;
      const ctx = JSON.parse(raw);
      if (ctx.page && ctx.page > 1 && currentPage !== ctx.page) {
        restoredRef.current = true;
        sessionStorage.setItem('spm_scroll_target', ctx.ref);
        sessionStorage.removeItem('spm_back_context');
        setFilter('page', ctx.page);
        window.RealtySoft?.search();
      }
    } catch { /* storage unavailable */ }
  }, []);

  // After results render: scroll to target card
  useEffect(() => {
    if (isLoading || !results?.data.length || !gridRef.current) return;

    try {
      const target = sessionStorage.getItem('spm_scroll_target');
      if (!target) return;
      sessionStorage.removeItem('spm_scroll_target');
      sessionStorage.removeItem('spm_back_context');

      requestAnimationFrame(() => {
        const card = gridRef.current?.querySelector(`[data-property-ref="${CSS.escape(target)}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (card as HTMLElement).classList.add('rs-card-highlight');
          setTimeout(() => (card as HTMLElement).classList.remove('rs-card-highlight'), 2000);
        }
      });
    } catch { /* storage unavailable */ }
  }, [isLoading, results]);

  const gridStyle = columns
    ? `grid-template-columns: repeat(${columns}, 1fr)`
    : undefined;

  if (isLoading) {
    return (
      <div class="rs-property-grid" style={gridStyle}>
        <Skeleton type="card" count={parseInt(columns || '3', 10) * 2} />
      </div>
    );
  }

  if (!results || results.data.length === 0) {
    return (
      <div class="rs-empty-state">
        <div class="rs-empty-state__icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <h3 class="rs-empty-state__title">{t('results_no_results', 'No results found')}</h3>
        <p class="rs-empty-state__message">
          {t('results_no_results_message', 'Try adjusting your search criteria to find more properties.')}
        </p>
      </div>
    );
  }

  return (
    <div class="rs-property-grid" style={gridStyle} ref={gridRef}>
      {results.data.map((property, i) => (
        <PropertyCard
          key={property.id}
          property={property}
          template={template}
          index={i}
        />
      ))}
    </div>
  );
}
