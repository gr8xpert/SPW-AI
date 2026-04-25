import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import { useFavorites } from '@/hooks/useFavorites';
import type { Property } from '@/types';

interface PropertyCardProps {
  property: Property;
  template?: number;
  index?: number;
}

const LISTING_TYPE_LABEL: Record<string, string> = {
  sale: 'card_for_sale',
  rent: 'card_for_rent',
  holiday_rent: 'card_holiday_rent',
  development: 'card_development',
};

const LISTING_TYPE_FALLBACK: Record<string, string> = {
  sale: 'For Sale',
  rent: 'For Rent',
  holiday_rent: 'Holiday Rent',
  development: 'Development',
};

export default function PropertyCard({ property, index = 0 }: PropertyCardProps) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const config = useConfig();
  const { isFavorite, toggle } = useFavorites();

  const image = property.images.length > 0
    ? property.images.sort((a, b) => a.order - b.order)[0]
    : null;

  const favorite = isFavorite(property.id);

  const handleClick = useCallback(() => {
    if (config.onPropertyClick) {
      config.onPropertyClick(property);
    } else if (config.propertyPageUrl) {
      window.location.href = `${config.propertyPageUrl}?id=${property.id}&ref=${property.reference}`;
    } else if (config.propertyPageSlug) {
      window.location.href = `/${config.propertyPageSlug}/${property.reference}`;
    }
  }, [config, property]);

  const handleFavoriteClick = useCallback((e: Event) => {
    e.stopPropagation();
    toggle(property.id);
  }, [property.id, toggle]);

  const listingLabelKey = LISTING_TYPE_LABEL[property.listingType] || 'card_for_sale';
  const listingFallback = LISTING_TYPE_FALLBACK[property.listingType] || 'For Sale';

  return (
    <div
      class="rs-property-card rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      onClick={handleClick}
      role="article"
    >
      <div class="rs-property-card__image">
        {image ? (
          <img
            src={image.thumbnailUrl || image.url}
            alt={image.alt || property.title}
            loading="lazy"
          />
        ) : (
          <div class="rs-property-card__no-image" />
        )}
        <div class="rs-property-card__badges">
          <span class="rs-property-card__badge rs-property-card__badge--type">
            {t(listingLabelKey, listingFallback)}
          </span>
          {property.isFeatured && (
            <span class="rs-property-card__badge rs-property-card__badge--featured">
              {t('card_featured', 'Featured')}
            </span>
          )}
        </div>
        {config.enableFavorites !== false && (
          <button
            class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}`}
            onClick={handleFavoriteClick}
            aria-label="Toggle favorite"
            type="button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        )}
      </div>

      <div class="rs-property-card__body">
        <div class="rs-property-card__price">
          {property.priceOnRequest
            ? t('card_price_on_request', 'Price on Request')
            : formatPrice(property.price, property.currency)}
        </div>

        <h3 class="rs-property-card__title">{property.title}</h3>

        <div class="rs-property-card__location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {property.location.name}
        </div>

        <div class="rs-property-card__specs">
          {property.bedrooms != null && property.bedrooms > 0 && (
            <span class="rs-property-card__spec">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 7v11m0-4h18m0 4V11a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4" />
                <path d="M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
              </svg>
              {property.bedrooms} {t('card_bedrooms', 'Beds')}
            </span>
          )}
          {property.bathrooms != null && property.bathrooms > 0 && (
            <span class="rs-property-card__spec">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1z" />
                <path d="M6 12V5a2 2 0 0 1 2-2h3v2.25" />
              </svg>
              {property.bathrooms} {t('card_bathrooms', 'Baths')}
            </span>
          )}
          {property.buildSize != null && property.buildSize > 0 && (
            <span class="rs-property-card__spec">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
              </svg>
              {property.buildSize} m² {t('card_build_size', 'Built')}
            </span>
          )}
          {property.plotSize != null && property.plotSize > 0 && (
            <span class="rs-property-card__spec">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="0" />
              </svg>
              {property.plotSize} m² {t('card_plot_size', 'Plot')}
            </span>
          )}
        </div>

        <div class="rs-property-card__footer">
          <span class="rs-property-card__type-label">
            {property.propertyType.name}
          </span>
          <span class="rs-property-card__view-details">
            {t('card_view_details', 'View Details')}
          </span>
        </div>
      </div>
    </div>
  );
}
