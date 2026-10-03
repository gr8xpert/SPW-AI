// Listing templates 01 and 11, and any grid or carousel without a known
// template number — the standard card.
import { getDisplayReference } from '@/core/property-display';
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardBadges, CardFavorite, CardImageCount, CardPrice, CardSpecs } from './CardParts';

export default function CardDefault({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { t, config, propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} dots />
        <CardBadges s={s} />
        <CardImageCount s={s} />
        <CardFavorite s={s} size={20} />
      </div>

      <div class="rs-property-card__body" onClick={handleClick}>
        <h3 class="rs-property-card__title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a></h3>

        <p class="rs-property-card__location">
          <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {property.location.name}
          <span class="rs-property-card__ref">{getDisplayReference(property, config)}</span>
        </p>

        {(property.shortDescription || property.description) && (
          <p class="rs-property-card__description">{property.shortDescription || property.description}</p>
        )}

        <CardSpecs s={s} />

        <div class="rs-property-card__price">
          <CardPrice s={s} />
        </div>

        <button type="button" class="rs-property-card__details-btn">
          {t('card_view_details', 'View Details')}
        </button>
      </div>
    </div>
  );
}
