import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
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
  const { t } = useLabels();

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
    <div class="rs-property-grid" style={gridStyle}>
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
