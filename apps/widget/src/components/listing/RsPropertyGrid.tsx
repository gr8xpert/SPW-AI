import { useEffect, useRef } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
import { useFilters } from '@/hooks/useFilters';
import { selectors } from '@/core/selectors';
import { useCardDesign } from './cards/registry';
import Skeleton from '@/components/common/Skeleton';
import { useBlockSearch } from '@/hooks/useBlockSearch';
import { isPageResults } from '@/core/block-role';
import RsResultsShell from './RsResultsShell';

interface RsPropertyGridProps {
  variation?: number;
  columns?: string;
  template?: number;
  standalone?: string;
  [key: string]: unknown;
}

export default function RsPropertyGrid(props: RsPropertyGridProps) {
  const { columns, template } = props;
  // The page's results area gets the count, the sort chooser and the page
  // numbers; a curated list shows its cards and nothing else.
  const onResultsPage = isPageResults(props._element as HTMLElement | undefined);
  // Grid or one-per-row, chosen with the view toggle. A curated list keeps the
  // shape its page was built with.
  const ui = useSelector(selectors.getUI);
  const layoutClass = onResultsPage && ui.layout === 'list' ? ' rs-property-grid--list' : '';
  const frame = (content: preact.ComponentChildren) =>
    onResultsPage ? <RsResultsShell>{content}</RsResultsShell> : <>{content}</>;
  // With data-spm-standalone the block searches on its own (its own filters),
  // otherwise it shows the page's search results.
  const own = useBlockSearch(props as Record<string, unknown>);
  const pageResults = useSelector(selectors.getResults);
  const pageLoading = useSelector(selectors.isSearchLoading);
  const results = own.enabled ? own.results : pageResults;
  const isLoading = own.enabled ? own.loading : pageLoading;
  const currentPage = useSelector(selectors.getCurrentPage);
  const { t } = useLabels();
  const { setFilter } = useFilters();
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  // This template's card design; null only while it is still being fetched.
  const Card = useCardDesign(template);

  // On mount: check if we need to restore page from back navigation
  useEffect(() => {
    if (restoredRef.current || own.enabled) return;
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

  if (isLoading || (!Card && results?.data.length)) {
    return frame(
      <div class={`rs-property-grid${layoutClass}`} style={gridStyle}>
        <Skeleton type="card" count={parseInt(columns || '3', 10) * 2} />
      </div>,
    );
  }

  if (!results || results.data.length === 0) {
    return frame(
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
      </div>,
    );
  }

  if (!Card) return null;

  return frame(
    <div class={`rs-property-grid${layoutClass}`} style={gridStyle} ref={gridRef}>
      {results.data.map((property, i) => (
        <Card
          key={property.id}
          property={property}
          index={i}
        />
      ))}
    </div>,
  );
}
