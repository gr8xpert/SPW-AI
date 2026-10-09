// Listing template 08 — "country": READ MORE on the photo, camera photo count.
import { getDisplayReference, specRange } from '@/core/property-display';
import { useCardState, type CardProps } from './useCardState';
import { CardSlides, CardBadges, CardFavorite, CardPrice } from './CardParts';

export default function CardCountry({ property, index = 0 }: CardProps) {
  const s = useCardState(property);
  const { t, config, totalImages, propertyUrl, handleClick, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class="rs-property-card rs-property-card--country rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <CardSlides s={s} />
        <CardBadges s={s} />
        <CardFavorite s={s} size={16} />

        {totalImages > 0 && (
          <div class="rs-property-card__image-count">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {totalImages}
          </div>
        )}

        <button type="button" class="rs-property-card__country-cta" onClick={handleClick}>
          {t('card_read_more', 'READ MORE')}
        </button>
      </div>

      <div class="rs-property-card__body" onClick={handleClick}>
        <div class="rs-property-card__country-price-row">
          <div class="rs-property-card__price">
            <CardPrice s={s} />
          </div>
          <span class="rs-property-card__ref">{getDisplayReference(property, config)}</span>
        </div>

        <h3 class="rs-property-card__title"><a class="rs-property-card__link" href={propertyUrl} onClick={handleLinkClick}>{property.title}</a></h3>

        {(property.shortDescription || property.description) && (
          <p class="rs-property-card__description">{property.shortDescription || property.description}</p>
        )}

        <div class="rs-property-card__country-divider" />

        <div class="rs-property-card__country-specs">
          {property.bedrooms != null && property.bedrooms > 0 && (
            <div class="rs-property-card__country-spec" data-tooltip={t('card_bedrooms', 'Bedrooms')}>
              <svg class="rs-property-card__country-spec-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
              </svg>
              <span class="rs-property-card__country-spec-value">{specRange(property, 'bedrooms')} {t('card_bedrooms', 'beds')}</span>
            </div>
          )}
          {property.bathrooms != null && property.bathrooms > 0 && (
            <div class="rs-property-card__country-spec" data-tooltip={t('card_bathrooms', 'Bathrooms')}>
              <svg class="rs-property-card__country-spec-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 12h16v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4z" /><path d="M6 12V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /><path d="M6 19v2" /><path d="M18 19v2" />
              </svg>
              <span class="rs-property-card__country-spec-value">{specRange(property, 'bathrooms')} {t('card_bathrooms', 'baths')}</span>
            </div>
          )}
          {property.buildSize != null && property.buildSize > 0 && (
            <div class="rs-property-card__country-spec" data-tooltip={t('card_built_area', 'Built Area')}>
              <svg class="rs-property-card__country-spec-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18" /><path d="M9 3v18" />
              </svg>
              <span class="rs-property-card__country-spec-value">{specRange(property, 'buildSize')} m²</span>
            </div>
          )}
          {property.terraceSize != null && property.terraceSize > 0 && (
            <div class="rs-property-card__country-spec" data-tooltip={t('card_terrace_size', 'Terrace Size')}>
              <svg class="rs-property-card__country-spec-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <span class="rs-property-card__country-spec-value">{specRange(property, 'terraceSize')} m²</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
