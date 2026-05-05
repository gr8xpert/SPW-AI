import { useEffect, useRef } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { useConfig } from '@/hooks/useConfig';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import { buildPropertyUrl } from '@/core/url-utils';
import type { Property } from '@/types';

export default function RsMapResultsPanel() {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const config = useConfig();
  const results = useSelector(selectors.getResults);
  const ui = useSelector(selectors.getUI);
  const isLoading = useSelector(selectors.isSearchLoading);

  const properties = results?.data ?? [];
  const highlightedId = ui.highlightedPropertyId;
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightedId != null && listRef.current) {
      const el = cardRefs.current.get(highlightedId);
      if (el) {
        const container = listRef.current;
        const elTop = el.offsetTop - container.offsetTop;
        const elBottom = elTop + el.offsetHeight;
        const scrollTop = container.scrollTop;
        const viewHeight = container.clientHeight;
        if (elTop < scrollTop || elBottom > scrollTop + viewHeight) {
          container.scrollTo({ top: elTop - 8, behavior: 'smooth' });
        }
      }
    }
  }, [highlightedId]);

  const handleCardClick = (property: Property) => {
    if (config.onPropertyClick) {
      config.onPropertyClick(property);
    } else {
      const url = buildPropertyUrl(property, config);
      if (url) window.location.href = url;
    }
  };

  const handleCardHover = (id: number | null) => {
    actions.mergeUI({ highlightedPropertyId: id });
  };

  return (
    <div class="rs-map-results-panel">
      <div class="rs-map-results-panel__header">
        <span class="rs-map-results-panel__count">
          {results?.meta.total ?? 0} {t('map_properties', 'Properties')}
        </span>
      </div>

      <div class="rs-map-results-panel__list" ref={listRef}>
        {isLoading && (
          <div class="rs-map-results-panel__loading">
            {t('loading', 'Loading...')}
          </div>
        )}

        {!isLoading && properties.length === 0 && (
          <div class="rs-map-results-panel__empty">
            {t('no_results', 'No properties found')}
          </div>
        )}

        {properties.map((property, index) => {
          const image = property.images.length > 0
            ? property.images.sort((a, b) => a.order - b.order)[0]
            : null;
          const isHighlighted = highlightedId === property.id;

          return (
            <div
              key={property.id}
              ref={(el) => {
                if (el) cardRefs.current.set(property.id, el);
              }}
              class={`rs-map-results-card${isHighlighted ? ' rs-map-results-card--highlighted' : ''}`}
              style={`--i:${index}`}
              onClick={() => handleCardClick(property)}
              onMouseEnter={() => handleCardHover(property.id)}
              onMouseLeave={() => handleCardHover(null)}
              role="article"
            >
              <div class="rs-map-results-card__image">
                {image ? (
                  <img
                    src={image.thumbnailUrl || image.url}
                    alt={image.alt || property.title}
                    loading="lazy"
                  />
                ) : (
                  <div class="rs-map-results-card__no-image" />
                )}
              </div>

              <div class="rs-map-results-card__body">
                <div class="rs-map-results-card__price">
                  {property.priceOnRequest
                    ? t('price_on_request', 'Price on Request')
                    : formatPrice(property.price, property.currency)}
                </div>
                <div class="rs-map-results-card__title">{property.title}</div>
                <div class="rs-map-results-card__location">{property.location.name}</div>
                <div class="rs-map-results-card__specs">
                  {property.bedrooms != null && property.bedrooms > 0 && (
                    <span>{property.bedrooms} {t('card_bedrooms', 'Beds')}</span>
                  )}
                  {property.bathrooms != null && property.bathrooms > 0 && (
                    <span>{property.bathrooms} {t('card_bathrooms', 'Baths')}</span>
                  )}
                  {property.buildSize != null && property.buildSize > 0 && (
                    <span>{property.buildSize} m²</span>
                  )}
                </div>
                <button type="button" class="rs-map-results-card__details">
                  {t('card_view_details', 'View Details')}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
