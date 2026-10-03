// Listing template 12 — "location-first" (ported from V3 rs-template-card-01).
// Centered content, location as h3 title, property type as gray subtitle,
// 4-spec grid with icons above values with units, description with 3-line
// clamp, white circular wishlist top-left, color-coded uppercase status badge
// top-right.
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardFavorite, CardImageCount, CardPrice } from './CardParts';

const T12_LABELS: Record<string, string> = {
  sale: 'RESALE',
  rent: 'FOR RENT',
  holiday_rent: 'HOLIDAY RENT',
  development: 'NEW DEVELOPMENT',
  offplan: 'OFF PLAN',
};

export default function CardLocationFirst({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { t, listingFallback, propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  const t12BadgeLabel = T12_LABELS[property.listingType] || listingFallback.toUpperCase();
  const t12BadgeModifier = property.listingType || 'sale';
  return (
    <div
      class="rs-property-card rs-property-card--location-first rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
      onClick={handleClick}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} />
        <CardFavorite s={s} size={20} />

        <div class="rs-property-card__badges">
          <span class={`rs-property-card__badge rs-property-card__badge--t12 rs-property-card__badge--t12-${t12BadgeModifier}`}>
            {t12BadgeLabel}
          </span>
        </div>

        <CardImageCount s={s} />
      </div>

      <div class="rs-property-card__body">
        <h3 class="rs-property-card__location-title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick} aria-label={property.title} title={property.title}>{property.location.name}</a></h3>
        {property.propertyType?.name && (
          <p class="rs-property-card__type-subtitle">{property.propertyType.name}</p>
        )}
        {(property.shortDescription || property.description) && (
          <p class="rs-property-card__description">{property.shortDescription || property.description}</p>
        )}

        <div class="rs-property-card__spec-grid">
          {property.bedrooms != null && property.bedrooms > 0 && (
            <div class="rs-property-card__spec-cell">
              <svg class="rs-property-card__spec-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v9" />
              </svg>
              <span class="rs-property-card__spec-value">{property.bedrooms} {t('card_beds_short', 'beds')}</span>
            </div>
          )}
          {property.bathrooms != null && property.bathrooms > 0 && (
            <div class="rs-property-card__spec-cell">
              <svg class="rs-property-card__spec-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
                <line x1="10" x2="8" y1="5" y2="7" /><line x1="2" x2="22" y1="12" y2="12" />
                <line x1="7" x2="7" y1="19" y2="21" /><line x1="17" x2="17" y1="19" y2="21" />
              </svg>
              <span class="rs-property-card__spec-value">{property.bathrooms} {t('card_baths_short', 'baths')}</span>
            </div>
          )}
          {property.buildSize != null && property.buildSize > 0 && (
            <div class="rs-property-card__spec-cell">
              <svg class="rs-property-card__spec-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              <span class="rs-property-card__spec-value">{Math.round(property.buildSize)} m²</span>
            </div>
          )}
          {property.terraceSize != null && property.terraceSize > 0 && (
            <div class="rs-property-card__spec-cell">
              <svg class="rs-property-card__spec-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <span class="rs-property-card__spec-value">{Math.round(property.terraceSize)} m²</span>
            </div>
          )}
        </div>

        <div class="rs-property-card__price">
          <CardPrice s={s} />
        </div>
      </div>
    </div>
  );
}
