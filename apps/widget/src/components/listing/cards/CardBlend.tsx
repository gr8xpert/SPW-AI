// Listing template 03 — "blend": title and price share a header row.
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardBadges, CardFavorite, CardImageCount, CardPrice, CardSpecs } from './CardParts';

export default function CardBlend({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { t, propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-property-card--blend rs-card-enter rs-card-hover"
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
        <div class="rs-property-card__blend-header">
          <h3 class="rs-property-card__title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a></h3>
          <span class="rs-property-card__blend-price">
            <CardPrice s={s} short />
          </span>
        </div>

        {(property.shortDescription || property.description) && (
          <p class="rs-property-card__description">{property.shortDescription || property.description}</p>
        )}

        <CardSpecs s={s} />

        <button type="button" class="rs-property-card__blend-cta">
          {t('card_view_details', 'View Details')}
        </button>
      </div>
    </div>
  );
}
