import { useEffect, useRef } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { useConfig } from '@/hooks/useConfig';
import { useFilters } from '@/hooks/useFilters';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import { buildPropertyUrl } from '@/core/url-utils';
import type { Property } from '@/types';
import { formatPropertyPrice, specRange } from '@/core/property-display';

interface RsMapResultsPanelProps {
  // 'list': narrow column beside a map. 'grid': full width (map hidden).
  layout?: 'list' | 'grid';
}

function firstImage(property: Property) {
  // Lowest order wins; the store's array is left as it is.
  let best: Property['images'][number] | null = null;
  for (const img of property.images || []) if (!best || (img.order ?? 0) < (best.order ?? 0)) best = img;
  return best;
}

export default function RsMapResultsPanel({ layout = 'list' }: RsMapResultsPanelProps) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const config = useConfig();
  const { setFilter } = useFilters();
  const results = useSelector(selectors.getResults);
  const ui = useSelector(selectors.getUI);
  const isLoading = useSelector(selectors.isSearchLoading);
  const currentPage = useSelector(selectors.getCurrentPage);
  const totalPages = useSelector(selectors.getTotalPages);

  const properties = results?.data ?? [];
  const highlightedId = ui.highlightedPropertyId;
  const cardRefs = useRef<Map<number, HTMLElement>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);

  // Hovering a marker brings its card into view (only inside the panel).
  useEffect(() => {
    if (highlightedId == null || !listRef.current || layout !== 'list') return;
    const el = cardRefs.current.get(highlightedId);
    if (!el) return;
    const container = listRef.current;
    const elTop = el.offsetTop - container.offsetTop;
    const elBottom = elTop + el.offsetHeight;
    if (elTop < container.scrollTop || elBottom > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: elTop - 8, behavior: 'smooth' });
    }
  }, [highlightedId]);

  const goToPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setFilter('page', page);
    window.RealtySoft?.search();
    listRef.current?.scrollTo({ top: 0 });
  };

  const total = results?.meta.total ?? 0;

  return (
    <div class={`rs-map-results-panel rs-map-results-panel--${layout}`}>
      <div class="rs-map-results-panel__header">
        <span class="rs-map-results-panel__count">
          <strong>{total}</strong> {t('map_properties', 'Properties')}
        </span>
        {isLoading && <span class="rs-map-results-panel__spinner" aria-label={t('loading', 'Loading...')} />}
      </div>

      <div class={`rs-map-results-panel__list${isLoading ? ' rs-map-results-panel__list--loading' : ''}`} ref={listRef}>
        {!isLoading && properties.length === 0 && (
          <div class="rs-map-results-panel__empty">{t('no_results', 'No properties found')}</div>
        )}

        {properties.map((property) => {
          const image = firstImage(property);
          const url = buildPropertyUrl(property, config) || '#';
          return (
            <a
              key={property.id}
              href={url}
              ref={(el) => {
                if (el) cardRefs.current.set(property.id, el);
                else cardRefs.current.delete(property.id);
              }}
              class={`rs-map-results-card${highlightedId === property.id ? ' rs-map-results-card--highlighted' : ''}`}
              onClick={(e) => {
                if (config.onPropertyClick) {
                  e.preventDefault();
                  config.onPropertyClick(property);
                }
              }}
              onMouseEnter={() => actions.mergeUI({ highlightedPropertyId: property.id })}
              onMouseLeave={() => actions.mergeUI({ highlightedPropertyId: null })}
              onFocus={() => actions.mergeUI({ highlightedPropertyId: property.id })}
              onBlur={() => actions.mergeUI({ highlightedPropertyId: null })}
            >
              <div class="rs-map-results-card__image">
                {image ? (
                  <img src={image.thumbnailUrl || image.url} alt={image.alt || property.title} loading="lazy" />
                ) : (
                  <div class="rs-map-results-card__no-image" />
                )}
              </div>

              <div class="rs-map-results-card__body">
                <div class="rs-map-results-card__price">
                  {formatPropertyPrice(property, (n) => formatPrice(n, property.currency), t, t('price_on_request', 'Price on request'))}
                </div>
                <div class="rs-map-results-card__title">{property.title}</div>
                {property.location?.name && <div class="rs-map-results-card__location">{property.location.name}</div>}
                <div class="rs-map-results-card__specs">
                  {!!property.bedrooms && <span>{specRange(property, 'bedrooms')} {t('card_bedrooms', 'Beds')}</span>}
                  {!!property.bathrooms && <span>{specRange(property, 'bathrooms')} {t('card_bathrooms', 'Baths')}</span>}
                  {!!property.buildSize && <span>{specRange(property, 'buildSize')} m²</span>}
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {totalPages > 1 && (
        <nav class="rs-map-results-panel__pager" aria-label={t('pagination_page', 'Page')}>
          <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1 || isLoading}>
            <span aria-hidden="true">&lsaquo;</span> {t('pagination_prev', 'Previous')}
          </button>
          <span class="rs-map-results-panel__page">
            {currentPage} / {totalPages}
          </span>
          <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages || isLoading}>
            {t('pagination_next', 'Next')} <span aria-hidden="true">&rsaquo;</span>
          </button>
        </nav>
      )}
    </div>
  );
}
