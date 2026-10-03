// Listing template 02 — "overlay": title, specs and price over the photo.
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardBadges, CardFavorite, CardPrice, CardSpecs } from './CardParts';

export default function CardOverlay({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-property-card--overlay rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
      onClick={handleClick}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} />
        <CardBadges s={s} own={false} />
        <CardFavorite s={s} size={20} />
      </div>

      <div class="rs-property-card__overlay">
        <div class="rs-property-card__overlay-top">
          <h3 class="rs-property-card__title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a></h3>
          <p class="rs-property-card__location">
            <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {property.location.name}
          </p>
        </div>
        <div class="rs-property-card__overlay-bottom">
          <CardSpecs s={s} terrace={false} />
          <div class="rs-property-card__price">
            <CardPrice s={s} />
          </div>
        </div>
      </div>
    </div>
  );
}
