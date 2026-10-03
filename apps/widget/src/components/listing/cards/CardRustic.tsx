// Listing template 09 — "rustic": large stat icons, price + button footer.
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardBadges, CardFavorite, CardImageCount, CardPrice } from './CardParts';

export default function CardRustic({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { t, propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-property-card--rustic rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
      onClick={handleClick}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} arrowSize={14} arrowStroke="2.4" />
        <CardFavorite s={s} size={16} />
        <CardBadges s={s} />
        <CardImageCount s={s} small />
      </div>

      <div class="rs-property-card__body">
        <h3 class="rs-property-card__title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a></h3>

        {(property.shortDescription || property.description) && (
          <p class="rs-property-card__description">{property.shortDescription || property.description}</p>
        )}

        <div class="rs-property-card__rustic-divider" />

        <div class="rs-property-card__rustic-stats">
          {property.bedrooms != null && property.bedrooms > 0 && (
            <div class="rs-property-card__rustic-stat" data-tooltip={t('card_bedrooms', 'Bedrooms')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
              </svg>
              <span class="rs-property-card__rustic-stat-label">{property.bedrooms} {t('card_beds_short', 'beds')}</span>
            </div>
          )}
          {property.bathrooms != null && property.bathrooms > 0 && (
            <div class="rs-property-card__rustic-stat" data-tooltip={t('card_bathrooms', 'Bathrooms')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12h16v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4z" /><path d="M6 12V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /><path d="M6 19v2" /><path d="M18 19v2" />
              </svg>
              <span class="rs-property-card__rustic-stat-label">{property.bathrooms} {t('card_baths_short', 'baths')}</span>
            </div>
          )}
          {property.buildSize != null && property.buildSize > 0 && (
            <div class="rs-property-card__rustic-stat" data-tooltip={t('card_built_area', 'Built Area')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18" /><path d="M9 3v18" />
              </svg>
              <span class="rs-property-card__rustic-stat-label">{property.buildSize} m²</span>
            </div>
          )}
          {property.terraceSize != null && property.terraceSize > 0 && (
            <div class="rs-property-card__rustic-stat" data-tooltip={t('card_terrace_size', 'Terrace Size')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <span class="rs-property-card__rustic-stat-label">{property.terraceSize} m²</span>
            </div>
          )}
        </div>

        <div class="rs-property-card__rustic-footer">
          <div class="rs-property-card__rustic-price">
            <CardPrice s={s} />
          </div>
          <button type="button" class="rs-property-card__rustic-cta">
            {t('card_view_details', 'View Details')}
          </button>
        </div>
      </div>
    </div>
  );
}
