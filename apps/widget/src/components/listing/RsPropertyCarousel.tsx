import { useRef, useCallback } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
import { selectors } from '@/core/selectors';
import PropertyCard from './PropertyCard';
import Skeleton from '@/components/common/Skeleton';

interface RsPropertyCarouselProps {
  template?: number;
  limit?: string;
  [key: string]: unknown;
}

export default function RsPropertyCarousel({ template, limit }: RsPropertyCarouselProps) {
  const results = useSelector(selectors.getResults);
  const isLoading = useSelector(selectors.isSearchLoading);
  const { t } = useLabels();
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = useCallback((direction: number) => {
    const track = trackRef.current;
    if (!track) return;
    const cardWidth = track.firstElementChild
      ? (track.firstElementChild as HTMLElement).offsetWidth + 24
      : 320;
    track.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
  }, []);

  if (isLoading) {
    return (
      <div class="rs-carousel">
        <div class="rs-carousel__track">
          <Skeleton type="card" count={4} />
        </div>
      </div>
    );
  }

  if (!results || results.data.length === 0) {
    return (
      <div class="rs-empty-state">
        <h3 class="rs-empty-state__title">{t('results_no_results', 'No results found')}</h3>
        <p class="rs-empty-state__message">
          {t('results_no_results_message', 'Try adjusting your search criteria to find more properties.')}
        </p>
      </div>
    );
  }

  const maxItems = limit ? parseInt(limit, 10) : results.data.length;
  const items = results.data.slice(0, maxItems);

  return (
    <div class="rs-carousel">
      <button
        class="rs-carousel__arrow rs-carousel__arrow--left"
        onClick={() => scrollBy(-1)}
        aria-label={t('pagination_prev', 'Previous')}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div class="rs-carousel__track rs-carousel-track" ref={trackRef}>
        {items.map((property, i) => (
          <div class="rs-carousel__slide" key={property.id}>
            <PropertyCard
              property={property}
              template={template}
              index={i}
            />
          </div>
        ))}
      </div>

      <button
        class="rs-carousel__arrow rs-carousel__arrow--right"
        onClick={() => scrollBy(1)}
        aria-label={t('pagination_next', 'Next')}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
