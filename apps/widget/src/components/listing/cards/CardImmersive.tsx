// Listing template 07 — "immersive": full-bleed photo with a text panel over it.
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardBadges, CardFavorite, CardPrice, CardSpecs } from './CardParts';

export default function CardImmersive({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { t, propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-property-card--immersive rs-card-enter"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
      onClick={handleClick}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} dots />

        <div class="rs-property-card__immersive-top">
          <span class="rs-property-card__immersive-price">
            <CardPrice s={s} short />
          </span>
          <CardFavorite s={s} size={20} />
        </div>

        <CardBadges s={s} />

        <div class="rs-property-card__immersive-panel">
          <h3 class="rs-property-card__title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a></h3>

          <p class="rs-property-card__location">
            <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {property.location.name}
          </p>

          {(property.shortDescription || property.description) && (
            <p class="rs-property-card__description">{property.shortDescription || property.description}</p>
          )}

          <CardSpecs s={s} />

          <button type="button" class="rs-property-card__immersive-cta">
            {t('card_view_details', 'View Details')}
          </button>
        </div>
      </div>
    </div>
  );
}
