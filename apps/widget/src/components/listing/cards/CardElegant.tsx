// Listing template 06 — "elegant": price first, divider, round arrow button.
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardBadges, CardFavorite, CardPrice, CardSpecs } from './CardParts';

export default function CardElegant({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-property-card--elegant rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} />
        <CardBadges s={s} />
        <CardFavorite s={s} size={18} />
      </div>

      <div class="rs-property-card__body" onClick={handleClick}>
        <div class="rs-property-card__price">
          <CardPrice s={s} />
        </div>

        <h3 class="rs-property-card__title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a></h3>

        <p class="rs-property-card__location">
          <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {property.location.name}
        </p>

        {(property.shortDescription || property.description) && (
          <p class="rs-property-card__description">{property.shortDescription || property.description}</p>
        )}

        <div class="rs-property-card__elegant-divider" />

        <CardSpecs s={s} />
      </div>

      <button type="button" class="rs-property-card__elegant-action" onClick={handleClick} aria-label="View details">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 17L17 7" /><path d="M9 7h8v8" />
        </svg>
      </button>
    </div>
  );
}
