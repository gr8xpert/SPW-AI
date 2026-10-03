// Listing template 05 — "showcase": everything overlaid on the photo.
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardBadges, CardFavorite, CardPrice } from './CardParts';

export default function CardShowcase({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { t, propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-property-card--showcase rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
      onClick={handleClick}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} />
        <CardBadges s={s} />
        <CardFavorite s={s} size={20} />

        <div class="rs-property-card__showcase-overlay">
          <div class="rs-property-card__showcase-price">
            <CardPrice s={s} />
          </div>
          <div class="rs-property-card__showcase-bottom">
            <div class="rs-property-card__showcase-address">
              <a class="rs-property-card__showcase-address-name rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a>
              <span>{property.location.name}</span>
            </div>
            <div class="rs-property-card__showcase-stats">
              {property.buildSize != null && property.buildSize > 0 && (
                <div class="rs-property-card__showcase-stat">
                  <span class="rs-property-card__showcase-stat-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="10" y2="17" /><line x1="14" y1="12" x2="14" y2="17" />
                    </svg>
                  </span>
                  <span class="rs-property-card__showcase-stat-text">
                    <span class="rs-property-card__showcase-stat-value">{property.buildSize}m²</span>
                    <span class="rs-property-card__showcase-stat-label">{t('card_built_area', 'Built')}</span>
                  </span>
                </div>
              )}
              {property.bedrooms != null && property.bedrooms > 0 && (
                <div class="rs-property-card__showcase-stat">
                  <span class="rs-property-card__showcase-stat-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
                    </svg>
                  </span>
                  <span class="rs-property-card__showcase-stat-text">
                    <span class="rs-property-card__showcase-stat-value">{property.bedrooms}</span>
                    <span class="rs-property-card__showcase-stat-label">{t('card_bedrooms', 'Beds')}</span>
                  </span>
                </div>
              )}
              {property.bathrooms != null && property.bathrooms > 0 && (
                <div class="rs-property-card__showcase-stat">
                  <span class="rs-property-card__showcase-stat-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1z" /><path d="M6 12V5a2 2 0 0 1 2-2h3v2.25" /><circle cx="12" cy="7" r="1.5" />
                    </svg>
                  </span>
                  <span class="rs-property-card__showcase-stat-text">
                    <span class="rs-property-card__showcase-stat-value">{property.bathrooms}</span>
                    <span class="rs-property-card__showcase-stat-label">{t('card_bathrooms', 'Baths')}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
