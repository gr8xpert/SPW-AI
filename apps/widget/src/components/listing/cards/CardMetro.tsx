// Listing template 10 — "metro": price band under the photo, spec chips.
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardFavorite, CardImageCount, CardPrice } from './CardParts';
import { specRange } from '@/core/property-display';

export default function CardMetro({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { t, listingLabelKey, listingFallback, propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-property-card--metro rs-card-enter"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} arrowSize={14} arrowStroke="2.4" />
        <CardFavorite s={s} size={18} />
        <CardImageCount s={s} small />
      </div>

      <div class="rs-property-card__metro-band">
        <span class="rs-property-card__metro-band-price">
          <CardPrice s={s} short />
        </span>
        <div class="rs-property-card__metro-band-badges">
          <span class="rs-property-card__metro-band-badge">
            {t(listingLabelKey, listingFallback)}
          </span>
          {property.isOwnProperty && (
            <span class="rs-property-card__metro-band-badge rs-property-card__metro-band-badge--own">
              {t('card_own', 'Own')}
            </span>
          )}
        </div>
      </div>

      <div class="rs-property-card__body" onClick={handleClick}>
        <h3 class="rs-property-card__title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a></h3>

        <p class="rs-property-card__location">
          <svg class="rs-property-card__location-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {property.location.name}
        </p>

        {(property.shortDescription || property.description) && (
          <p class="rs-property-card__description">{property.shortDescription || property.description}</p>
        )}

        <div class="rs-property-card__metro-chips">
          {property.bedrooms != null && property.bedrooms > 0 && (
            <span class="rs-property-card__metro-chip">
              {specRange(property, 'bedrooms')} {t('card_beds_short', 'beds')}
            </span>
          )}
          {property.bathrooms != null && property.bathrooms > 0 && (
            <span class="rs-property-card__metro-chip">
              {specRange(property, 'bathrooms')} {t('card_baths_short', 'baths')}
            </span>
          )}
          {property.buildSize != null && property.buildSize > 0 && (
            <span class="rs-property-card__metro-chip">
              {specRange(property, 'buildSize')} m²
            </span>
          )}
          {property.terraceSize != null && property.terraceSize > 0 && (
            <span class="rs-property-card__metro-chip">
              {specRange(property, 'terraceSize')} m² {t('card_terrace_short', 'terrace')}
            </span>
          )}
        </div>

        <button type="button" class="rs-property-card__metro-cta">
          {t('card_view_details', 'View Details')}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 17L17 7" /><path d="M9 7h8v8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
