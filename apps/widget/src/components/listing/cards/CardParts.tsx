// Pieces several card designs share. Each one renders exactly the markup the
// designs had inline before the split, so customer CSS keeps matching.
import RsWishlistIcon from '@/components/common/RsWishlistIcon';
import AnimatedPrice from '@/components/common/AnimatedPrice';
import type { CardState } from './useCardState';

interface PartProps {
  s: CardState;
}

/** The image slider, or the empty placeholder when the listing has no photos. */
export function CardSlides({ s, arrowSize = 16, arrowStroke = '2.5', dots = false }: PartProps & {
  arrowSize?: number;
  arrowStroke?: string;
  dots?: boolean;
}) {
  const { property, carouselImages, loadedSlides, slideIndex, prevSlide, nextSlide } = s;
  return carouselImages.length > 0 ? (
    <div class="rs-property-card__carousel">
      {carouselImages.map((img, i) => (
        <img
          key={img.id}
          src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
          alt={img.alt || property.title}
          // Feed photos are full size (1600px); off-screen cards waiting their
          // turn leaves the bandwidth to the ones the visitor can see.
          loading="lazy"
          decoding="async"
          class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
        />
      ))}
      {carouselImages.length > 1 && (
        <>
          <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
            <svg width={arrowSize} height={arrowSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={arrowStroke}><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
            <svg width={arrowSize} height={arrowSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={arrowStroke}><polyline points="9 6 15 12 9 18" /></svg>
          </button>
          {dots && (
            <div class="rs-property-card__dots">
              {carouselImages.map((_, i) => (
                <span key={i} class={`rs-property-card__dot${i === slideIndex ? ' rs-property-card__dot--active' : ''}`} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  ) : (
    <div class="rs-property-card__no-image" />
  );
}

/** Listing type, "Own" and "Featured" badges. */
export function CardBadges({ s, own = true }: PartProps & { own?: boolean }) {
  const { property, t, listingLabelKey, listingFallback } = s;
  return (
    <div class="rs-property-card__badges">
      <span class="rs-property-card__badge rs-property-card__badge--type">
        {t(listingLabelKey, listingFallback)}
      </span>
      {own && property.isOwnProperty && (
        <span class="rs-property-card__badge rs-property-card__badge--own">
          {t('card_own', 'Own')}
        </span>
      )}
      {property.isFeatured && (
        <span class="rs-property-card__badge rs-property-card__badge--featured">
          {t('card_featured', 'Featured')}
        </span>
      )}
    </div>
  );
}

/** Wishlist heart, hidden when the site turned favourites off. */
export function CardFavorite({ s, size }: PartProps & { size: number }) {
  const { config, favorite, heartBounce, handleFavoriteClick } = s;
  if (config.enableFavorites === false) return null;
  return (
    <button
      class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
      onClick={handleFavoriteClick}
      aria-label="Toggle favorite"
      type="button"
    >
      <RsWishlistIcon size={size} filled={favorite} />
    </button>
  );
}

/** Photo count over the image (picture icon). `small` is the 13px variant. */
export function CardImageCount({ s, small = false }: PartProps & { small?: boolean }) {
  const { totalImages } = s;
  if (!(totalImages > 0)) return null;
  return (
    <div class="rs-property-card__image-count">
      {small ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      )}
      {totalImages}
    </div>
  );
}

/** The price, or "price on request". `short` uses the P.O.R. fallback text. */
export function CardPrice({ s, short = false }: PartProps & { short?: boolean }) {
  const { property, t, priceFormatter } = s;
  return property.priceOnRequest
    ? <>{t('card_price_on_request', short ? 'P.O.R.' : 'Price on Request')}</>
    : <AnimatedPrice value={property.price} format={priceFormatter} />;
}

/** The row of small spec icons (beds, baths, built area, terrace). */
export function CardSpecs({ s, terrace = true }: PartProps & { terrace?: boolean }) {
  const { property, t } = s;
  return (
    <div class="rs-property-card__specs">
      {property.bedrooms != null && property.bedrooms > 0 && (
        <span class="rs-property-card__spec" data-tooltip={t('card_bedrooms', 'Bedrooms')}>
          <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
          </svg>
          {property.bedrooms}
        </span>
      )}
      {property.bathrooms != null && property.bathrooms > 0 && (
        <span class="rs-property-card__spec" data-tooltip={t('card_bathrooms', 'Bathrooms')}>
          <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1z" /><path d="M6 12V5a2 2 0 0 1 2-2h3v2.25" /><circle cx="12" cy="7" r="1.5" />
          </svg>
          {property.bathrooms}
        </span>
      )}
      {property.buildSize != null && property.buildSize > 0 && (
        <span class="rs-property-card__spec" data-tooltip={t('card_built_area', 'Built Area')}>
          <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="10" y2="17" /><line x1="14" y1="12" x2="14" y2="17" />
          </svg>
          {property.buildSize} m²
        </span>
      )}
      {terrace && property.terraceSize != null && property.terraceSize > 0 && (
        <span class="rs-property-card__spec" data-tooltip={t('card_terrace_size', 'Terrace Size')}>
          <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
          {property.terraceSize} m²
        </span>
      )}
    </div>
  );
}
