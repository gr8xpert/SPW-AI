import { useState, useCallback, useRef, useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import { useFavorites } from '@/hooks/useFavorites';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { buildPropertyUrl } from '@/core/url-utils';
import RsWishlistIcon from '@/components/common/RsWishlistIcon';
import AnimatedPrice from '@/components/common/AnimatedPrice';
import type { Property } from '@/types';

interface PropertyCardProps {
  property: Property;
  template?: number;
  index?: number;
}

const LISTING_TYPE_LABEL: Record<string, string> = {
  sale: 'card_for_sale',
  rent: 'card_for_rent',
  holiday_rent: 'card_holiday_rent',
  development: 'card_development',
  offplan: 'card_offplan',
};

const LISTING_TYPE_FALLBACK: Record<string, string> = {
  sale: 'For Sale',
  rent: 'For Rent',
  holiday_rent: 'Holiday Rent',
  development: 'Development',
  offplan: 'Off Plan',
};

export default function PropertyCard({ property, template = 1, index = 0 }: PropertyCardProps) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const config = useConfig();
  const { isFavorite, toggle } = useFavorites();
  const currentPage = useSelector(selectors.getCurrentPage);
  const [slideIndex, setSlideIndex] = useState(0);
  const [loadedSlides, setLoadedSlides] = useState<Set<number>>(() => new Set([0]));
  const [heartBounce, setHeartBounce] = useState(false);
  const touchStartX = useRef(0);

  const priceFormatter = useMemo(
    () => (n: number) => formatPrice(n, property.currency),
    [formatPrice, property.currency],
  );

  const sortedImages = property.images.slice().sort((a, b) => a.order - b.order);
  const carouselImages = sortedImages.slice(0, 5);
  const totalImages = property.images.length;
  const favorite = isFavorite(property.id);

  const handleClick = useCallback(() => {
    try {
      sessionStorage.setItem('spm_back_context', JSON.stringify({
        page: currentPage,
        ref: property.reference,
        url: window.location.href,
      }));
    } catch { /* storage unavailable */ }

    if (config.onPropertyClick) {
      config.onPropertyClick(property);
    } else {
      const url = buildPropertyUrl(property, config);
      if (url) window.location.href = url;
    }
  }, [config, property, currentPage]);

  const goToSlide = useCallback((next: number) => {
    setSlideIndex(next);
    setLoadedSlides(prev => {
      const updated = new Set(prev);
      updated.add(next);
      const preload = (next + 1) % carouselImages.length;
      updated.add(preload);
      return updated;
    });
  }, [carouselImages.length]);

  const handleFavoriteClick = useCallback((e: Event) => {
    e.stopPropagation();
    toggle(property.id);
    setHeartBounce(true);
    setTimeout(() => setHeartBounce(false), 300);
  }, [property.id, toggle]);

  const prevSlide = useCallback((e: Event) => {
    e.stopPropagation();
    const next = slideIndex > 0 ? slideIndex - 1 : carouselImages.length - 1;
    goToSlide(next);
  }, [slideIndex, carouselImages.length, goToSlide]);

  const nextSlide = useCallback((e: Event) => {
    e.stopPropagation();
    const next = slideIndex < carouselImages.length - 1 ? slideIndex + 1 : 0;
    goToSlide(next);
  }, [slideIndex, carouselImages.length, goToSlide]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 30) {
      if (diff > 0) goToSlide(slideIndex < carouselImages.length - 1 ? slideIndex + 1 : 0);
      else goToSlide(slideIndex > 0 ? slideIndex - 1 : carouselImages.length - 1);
    }
  }, [slideIndex, carouselImages.length, goToSlide]);

  const listingLabelKey = LISTING_TYPE_LABEL[property.listingType] || 'card_for_sale';
  const listingFallback = LISTING_TYPE_FALLBACK[property.listingType] || 'For Sale';

  if (template === 3) {
    return (
      <div
        class="rs-property-card rs-property-card--blend rs-card-enter rs-card-hover"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                  <div class="rs-property-card__dots">
                    {carouselImages.map((_, i) => (
                      <span key={i} class={`rs-property-card__dot${i === slideIndex ? ' rs-property-card__dot--active' : ''}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          <div class="rs-property-card__badges">
            <span class="rs-property-card__badge rs-property-card__badge--type">
              {t(listingLabelKey, listingFallback)}
            </span>
            {property.isOwnProperty && (
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

          {totalImages > 0 && (
            <div class="rs-property-card__image-count">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              {totalImages}
            </div>
          )}

          {config.enableFavorites !== false && (
            <button
              class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Toggle favorite"
              type="button"
            >
              <RsWishlistIcon size={20} filled={favorite} />
            </button>
          )}
        </div>

        <div class="rs-property-card__body" onClick={handleClick}>
          <div class="rs-property-card__blend-header">
            <h3 class="rs-property-card__title">{property.title}</h3>
            <span class="rs-property-card__blend-price">
              {property.priceOnRequest
                ? t('card_price_on_request', 'P.O.R.')
                : <AnimatedPrice value={property.price} format={priceFormatter} />}
            </span>
          </div>

          {property.shortDescription && (
            <p class="rs-property-card__description">{property.shortDescription}</p>
          )}

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
            {property.plotSize != null && property.plotSize > 0 && (
              <span class="rs-property-card__spec" data-tooltip={t('card_plot_size', 'Plot Size')}>
                <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6l9-4 9 4v12l-9 4-9-4z" /><path d="M3 6l9 4" /><path d="M12 22V10" /><path d="M21 6l-9 4" />
                </svg>
                {property.plotSize} m²
              </span>
            )}
            {property.terraceSize != null && property.terraceSize > 0 && (
              <span class="rs-property-card__spec" data-tooltip={t('card_terrace_size', 'Terrace Size')}>
                <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                {property.terraceSize} m²
              </span>
            )}
          </div>

          <button type="button" class="rs-property-card__blend-cta">
            {t('card_view_details', 'View Details')}
          </button>
        </div>
      </div>
    );
  }

  if (template === 4) {
    return (
      <div
        class="rs-property-card rs-property-card--compact rs-card-enter rs-card-hover"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          <div class="rs-property-card__badges">
            <span class="rs-property-card__badge rs-property-card__badge--type">
              {t(listingLabelKey, listingFallback)}
            </span>
            {property.isOwnProperty && (
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

          {totalImages > 0 && (
            <div class="rs-property-card__image-count">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              {totalImages}
            </div>
          )}

          {config.enableFavorites !== false && (
            <button
              class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Toggle favorite"
              type="button"
            >
              <RsWishlistIcon size={18} filled={favorite} />
            </button>
          )}
        </div>

        {carouselImages.length > 1 && (
          <div class="rs-property-card__dots rs-property-card__dots--outer">
            {carouselImages.map((_, i) => (
              <span key={i} class={`rs-property-card__dot${i === slideIndex ? ' rs-property-card__dot--active' : ''}`} />
            ))}
          </div>
        )}

        <div class="rs-property-card__body" onClick={handleClick}>
          <h3 class="rs-property-card__title">{property.title}</h3>

          <p class="rs-property-card__location">
            <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {property.location.name}
            <span class="rs-property-card__ref">{property.reference}</span>
          </p>

          {property.shortDescription && (
            <p class="rs-property-card__description">{property.shortDescription}</p>
          )}

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
            {property.plotSize != null && property.plotSize > 0 && (
              <span class="rs-property-card__spec" data-tooltip={t('card_plot_size', 'Plot Size')}>
                <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6l9-4 9 4v12l-9 4-9-4z" /><path d="M3 6l9 4" /><path d="M12 22V10" /><path d="M21 6l-9 4" />
                </svg>
                {property.plotSize} m²
              </span>
            )}
            {property.terraceSize != null && property.terraceSize > 0 && (
              <span class="rs-property-card__spec" data-tooltip={t('card_terrace_size', 'Terrace Size')}>
                <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                {property.terraceSize} m²
              </span>
            )}
          </div>

          <div class="rs-property-card__compact-footer">
            <div class="rs-property-card__price">
              {property.priceOnRequest
                ? t('card_price_on_request', 'Price on Request')
                : <AnimatedPrice value={property.price} format={priceFormatter} />}
            </div>
            <button type="button" class="rs-property-card__compact-cta">
              {t('card_view_details', 'View Details')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (template === 5) {
    return (
      <div
        class="rs-property-card rs-property-card--showcase rs-card-enter rs-card-hover"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
        onClick={handleClick}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          <div class="rs-property-card__badges">
            <span class="rs-property-card__badge rs-property-card__badge--type">
              {t(listingLabelKey, listingFallback)}
            </span>
            {property.isOwnProperty && (
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

          {config.enableFavorites !== false && (
            <button
              class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Toggle favorite"
              type="button"
            >
              <RsWishlistIcon size={20} filled={favorite} />
            </button>
          )}

          <div class="rs-property-card__showcase-overlay">
            <div class="rs-property-card__showcase-price">
              {property.priceOnRequest
                ? t('card_price_on_request', 'Price on Request')
                : <AnimatedPrice value={property.price} format={priceFormatter} />}
            </div>
            <div class="rs-property-card__showcase-bottom">
              <div class="rs-property-card__showcase-address">
                <span class="rs-property-card__showcase-address-name">{property.title}</span>
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

  if (template === 6) {
    return (
      <div
        class="rs-property-card rs-property-card--elegant rs-card-enter rs-card-hover"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          <div class="rs-property-card__badges">
            <span class="rs-property-card__badge rs-property-card__badge--type">
              {t(listingLabelKey, listingFallback)}
            </span>
            {property.isOwnProperty && (
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

          {config.enableFavorites !== false && (
            <button
              class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Toggle favorite"
              type="button"
            >
              <RsWishlistIcon size={18} filled={favorite} />
            </button>
          )}
        </div>

        <div class="rs-property-card__body" onClick={handleClick}>
          <div class="rs-property-card__price">
            {property.priceOnRequest
              ? t('card_price_on_request', 'Price on Request')
              : <AnimatedPrice value={property.price} format={priceFormatter} />}
          </div>

          <h3 class="rs-property-card__title">{property.title}</h3>

          <p class="rs-property-card__location">
            <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {property.location.name}
          </p>

          {property.shortDescription && (
            <p class="rs-property-card__description">{property.shortDescription}</p>
          )}

          <div class="rs-property-card__elegant-divider" />

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
            {property.plotSize != null && property.plotSize > 0 && (
              <span class="rs-property-card__spec" data-tooltip={t('card_plot_size', 'Plot Size')}>
                <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6l9-4 9 4v12l-9 4-9-4z" /><path d="M3 6l9 4" /><path d="M12 22V10" /><path d="M21 6l-9 4" />
                </svg>
                {property.plotSize} m²
              </span>
            )}
            {property.terraceSize != null && property.terraceSize > 0 && (
              <span class="rs-property-card__spec" data-tooltip={t('card_terrace_size', 'Terrace Size')}>
                <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                {property.terraceSize} m²
              </span>
            )}
          </div>
        </div>

        <button type="button" class="rs-property-card__elegant-action" onClick={handleClick} aria-label="View details">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 17L17 7" /><path d="M9 7h8v8" />
          </svg>
        </button>
      </div>
    );
  }

  if (template === 10) {
    return (
      <div
        class="rs-property-card rs-property-card--metro rs-card-enter"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          {config.enableFavorites !== false && (
            <button
              class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Toggle favorite"
              type="button"
            >
              <RsWishlistIcon size={18} filled={favorite} />
            </button>
          )}

          {totalImages > 0 && (
            <div class="rs-property-card__image-count">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              {totalImages}
            </div>
          )}
        </div>

        <div class="rs-property-card__metro-band">
          <span class="rs-property-card__metro-band-price">
            {property.priceOnRequest
              ? t('card_price_on_request', 'P.O.R.')
              : <AnimatedPrice value={property.price} format={priceFormatter} />}
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
          <h3 class="rs-property-card__title">{property.title}</h3>

          <p class="rs-property-card__location">
            <svg class="rs-property-card__location-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {property.location.name}
          </p>

          <div class="rs-property-card__metro-chips">
            {property.bedrooms != null && property.bedrooms > 0 && (
              <span class="rs-property-card__metro-chip">
                {property.bedrooms} {t('card_beds_short', 'beds')}
              </span>
            )}
            {property.bathrooms != null && property.bathrooms > 0 && (
              <span class="rs-property-card__metro-chip">
                {property.bathrooms} {t('card_baths_short', 'baths')}
              </span>
            )}
            {property.buildSize != null && property.buildSize > 0 && (
              <span class="rs-property-card__metro-chip">
                {property.buildSize} m²
              </span>
            )}
            {property.plotSize != null && property.plotSize > 0 && (
              <span class="rs-property-card__metro-chip">
                {property.plotSize} m² {t('card_plot_short', 'plot')}
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

  if (template === 9) {
    return (
      <div
        class="rs-property-card rs-property-card--rustic rs-card-enter rs-card-hover"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
        onClick={handleClick}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          {config.enableFavorites !== false && (
            <button
              class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Toggle favorite"
              type="button"
            >
              <RsWishlistIcon size={16} filled={favorite} />
            </button>
          )}

          <div class="rs-property-card__badges">
            <span class="rs-property-card__badge rs-property-card__badge--type">
              {t(listingLabelKey, listingFallback)}
            </span>
            {property.isOwnProperty && (
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

          {totalImages > 0 && (
            <div class="rs-property-card__image-count">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              {totalImages}
            </div>
          )}
        </div>

        <div class="rs-property-card__body">
          <h3 class="rs-property-card__title">{property.title}</h3>

          {property.shortDescription && (
            <p class="rs-property-card__description">{property.shortDescription}</p>
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
            {property.plotSize != null && property.plotSize > 0 && (
              <div class="rs-property-card__rustic-stat" data-tooltip={t('card_plot_size', 'Plot Size')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                </svg>
                <span class="rs-property-card__rustic-stat-label">{property.plotSize} m²</span>
              </div>
            )}
          </div>

          <div class="rs-property-card__rustic-footer">
            <div class="rs-property-card__rustic-price">
              {property.priceOnRequest
                ? t('card_price_on_request', 'Price on Request')
                : <AnimatedPrice value={property.price} format={priceFormatter} />}
            </div>
            <button type="button" class="rs-property-card__rustic-cta">
              {t('card_view_details', 'View Details')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (template === 8) {
    return (
      <div
        class="rs-property-card rs-property-card--country rs-card-enter rs-card-hover"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          <div class="rs-property-card__badges">
            <span class="rs-property-card__badge rs-property-card__badge--type">
              {t(listingLabelKey, listingFallback)}
            </span>
            {property.isOwnProperty && (
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

          {config.enableFavorites !== false && (
            <button
              class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Toggle favorite"
              type="button"
            >
              <RsWishlistIcon size={16} filled={favorite} />
            </button>
          )}

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
              {property.priceOnRequest
                ? t('card_price_on_request', 'Price on Request')
                : <AnimatedPrice value={property.price} format={priceFormatter} />}
            </div>
            <span class="rs-property-card__ref">{property.reference}</span>
          </div>

          <h3 class="rs-property-card__title">{property.title}</h3>

          {property.shortDescription && (
            <p class="rs-property-card__description">{property.shortDescription}</p>
          )}

          <div class="rs-property-card__country-divider" />

          <div class="rs-property-card__country-icons">
            {property.bedrooms != null && property.bedrooms > 0 && (
              <span class="rs-property-card__country-icon" data-tooltip={t('card_bedrooms', 'Bedrooms')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
                </svg>
              </span>
            )}
            {property.bathrooms != null && property.bathrooms > 0 && (
              <span class="rs-property-card__country-icon" data-tooltip={t('card_bathrooms', 'Bathrooms')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 12h16v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4z" /><path d="M6 12V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" /><path d="M6 19v2" /><path d="M18 19v2" />
                </svg>
              </span>
            )}
            {property.buildSize != null && property.buildSize > 0 && (
              <span class="rs-property-card__country-icon" data-tooltip={t('card_built_area', 'Built Area')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18" /><path d="M9 3v18" />
                </svg>
              </span>
            )}
            {property.plotSize != null && property.plotSize > 0 && (
              <span class="rs-property-card__country-icon" data-tooltip={t('card_plot_size', 'Plot Size')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 3v18" /><path d="M19 3v18" /><path d="M5 7h14" /><path d="M5 17h14" />
                </svg>
              </span>
            )}
          </div>

          <p class="rs-property-card__country-stats-text">
            {property.bedrooms != null && property.bedrooms > 0 && (
              <>{property.bedrooms} {t('card_beds_short', 'beds')}</>
            )}
            {property.bathrooms != null && property.bathrooms > 0 && (
              <>{property.bedrooms != null && property.bedrooms > 0 ? '  ' : ''}{property.bathrooms} {t('card_baths_short', 'baths')}</>
            )}
            {property.buildSize != null && property.buildSize > 0 && (
              <>{'  '}{property.buildSize} m²</>
            )}
            {property.plotSize != null && property.plotSize > 0 && (
              <>{'  '}{property.plotSize} m²</>
            )}
          </p>
        </div>
      </div>
    );
  }

  if (template === 7) {
    return (
      <div
        class="rs-property-card rs-property-card--immersive rs-card-enter"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
        onClick={handleClick}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                  <div class="rs-property-card__dots">
                    {carouselImages.map((_, i) => (
                      <span key={i} class={`rs-property-card__dot${i === slideIndex ? ' rs-property-card__dot--active' : ''}`} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          <div class="rs-property-card__immersive-top">
            <span class="rs-property-card__immersive-price">
              {property.priceOnRequest
                ? t('card_price_on_request', 'P.O.R.')
                : <AnimatedPrice value={property.price} format={priceFormatter} />}
            </span>
            {config.enableFavorites !== false && (
              <button
                class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
                onClick={handleFavoriteClick}
                aria-label="Toggle favorite"
                type="button"
              >
                <RsWishlistIcon size={20} filled={favorite} />
              </button>
            )}
          </div>

          <div class="rs-property-card__badges">
            <span class="rs-property-card__badge rs-property-card__badge--type">
              {t(listingLabelKey, listingFallback)}
            </span>
            {property.isOwnProperty && (
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

          <div class="rs-property-card__immersive-panel">
            <h3 class="rs-property-card__title">{property.title}</h3>

            <p class="rs-property-card__location">
              <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {property.location.name}
            </p>

            {property.shortDescription && (
              <p class="rs-property-card__description">{property.shortDescription}</p>
            )}

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
              {property.plotSize != null && property.plotSize > 0 && (
                <span class="rs-property-card__spec" data-tooltip={t('card_plot_size', 'Plot Size')}>
                  <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6l9-4 9 4v12l-9 4-9-4z" /><path d="M3 6l9 4" /><path d="M12 22V10" /><path d="M21 6l-9 4" />
                  </svg>
                  {property.plotSize} m²
                </span>
              )}
              {property.terraceSize != null && property.terraceSize > 0 && (
                <span class="rs-property-card__spec" data-tooltip={t('card_terrace_size', 'Terrace Size')}>
                  <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
                  </svg>
                  {property.terraceSize} m²
                </span>
              )}
            </div>

            <button type="button" class="rs-property-card__immersive-cta">
              {t('card_view_details', 'View Details')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (template === 2) {
    return (
      <div
        class="rs-property-card rs-property-card--overlay rs-card-enter rs-card-hover"
        style={`--i:${index}`}
        role="article"
        data-property-ref={property.reference}
        onClick={handleClick}
      >
        <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          {carouselImages.length > 0 ? (
            <div class="rs-property-card__carousel">
              {carouselImages.map((img, i) => (
                <img
                  key={img.id}
                  src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                  alt={img.alt || property.title}
                  class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
                />
              ))}
              {carouselImages.length > 1 && (
                <>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div class="rs-property-card__no-image" />
          )}

          <div class="rs-property-card__badges">
            <span class="rs-property-card__badge rs-property-card__badge--type">
              {t(listingLabelKey, listingFallback)}
            </span>
            {property.isFeatured && (
              <span class="rs-property-card__badge rs-property-card__badge--featured">
                {t('card_featured', 'Featured')}
              </span>
            )}
          </div>

          {config.enableFavorites !== false && (
            <button
              class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
              onClick={handleFavoriteClick}
              aria-label="Toggle favorite"
              type="button"
            >
              <RsWishlistIcon size={20} filled={favorite} />
            </button>
          )}
        </div>

        <div class="rs-property-card__overlay">
          <div class="rs-property-card__overlay-top">
            <h3 class="rs-property-card__title">{property.title}</h3>
            <p class="rs-property-card__location">
              <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {property.location.name}
            </p>
          </div>
          <div class="rs-property-card__overlay-bottom">
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
            </div>
            <div class="rs-property-card__price">
              {property.priceOnRequest
                ? t('card_price_on_request', 'Price on Request')
                : <AnimatedPrice value={property.price} format={priceFormatter} />}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      class="rs-property-card rs-card-enter rs-card-hover"
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
    >
      <div class="rs-property-card__image" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {carouselImages.length > 0 ? (
          <div class="rs-property-card__carousel">
            {carouselImages.map((img, i) => (
              <img
                key={img.id}
                src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                alt={img.alt || property.title}
                class={`rs-property-card__slide${i === slideIndex ? ' rs-property-card__slide--active' : ''}`}
              />
            ))}
            {carouselImages.length > 1 && (
              <>
                <button type="button" class="rs-property-card__arrow rs-property-card__arrow--prev" onClick={prevSlide} aria-label="Previous">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button type="button" class="rs-property-card__arrow rs-property-card__arrow--next" onClick={nextSlide} aria-label="Next">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
                </button>
                <div class="rs-property-card__dots">
                  {carouselImages.map((_, i) => (
                    <span key={i} class={`rs-property-card__dot${i === slideIndex ? ' rs-property-card__dot--active' : ''}`} />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div class="rs-property-card__no-image" />
        )}

        <div class="rs-property-card__badges">
          <span class="rs-property-card__badge rs-property-card__badge--type">
            {t(listingLabelKey, listingFallback)}
          </span>
          {property.isOwnProperty && (
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

        {totalImages > 0 && (
          <div class="rs-property-card__image-count">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            {totalImages}
          </div>
        )}

        {config.enableFavorites !== false && (
          <button
            class={`rs-property-card__favorite${favorite ? ' rs-property-card__favorite--active' : ''}${heartBounce ? ' rs-heart-bounce' : ''}`}
            onClick={handleFavoriteClick}
            aria-label="Toggle favorite"
            type="button"
          >
            <RsWishlistIcon size={20} filled={favorite} />
          </button>
        )}
      </div>

      <div class="rs-property-card__body" onClick={handleClick}>
        <h3 class="rs-property-card__title">{property.title}</h3>

        <p class="rs-property-card__location">
          <svg class="rs-property-card__location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {property.location.name}
          <span class="rs-property-card__ref">{property.reference}</span>
        </p>

        {property.shortDescription && (
          <p class="rs-property-card__description">{property.shortDescription}</p>
        )}

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
          {property.plotSize != null && property.plotSize > 0 && (
            <span class="rs-property-card__spec" data-tooltip={t('card_plot_size', 'Plot Size')}>
              <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6l9-4 9 4v12l-9 4-9-4z" /><path d="M3 6l9 4" /><path d="M12 22V10" /><path d="M21 6l-9 4" />
              </svg>
              {property.plotSize} m²
            </span>
          )}
          {property.terraceSize != null && property.terraceSize > 0 && (
            <span class="rs-property-card__spec" data-tooltip={t('card_terrace_size', 'Terrace Size')}>
              <svg class="rs-property-card__spec-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3v18" /><path d="M3 12h18" /><rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              {property.terraceSize} m²
            </span>
          )}
        </div>

        <div class="rs-property-card__price">
          {property.priceOnRequest
            ? t('card_price_on_request', 'Price on Request')
            : <AnimatedPrice value={property.price} format={priceFormatter} />}
        </div>

        <button type="button" class="rs-property-card__details-btn">
          {t('card_view_details', 'View Details')}
        </button>
      </div>
    </div>
  );
}
