import { useState, useCallback, useRef, useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import { useFavorites } from '@/hooks/useFavorites';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { buildPropertyUrl } from '@/core/url-utils';
import type { Property } from '@/types';

export interface CardProps {
  property: Property;
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

/**
 * Everything a card design needs besides its own markup: the image slider,
 * the wishlist toggle, price formatting, click handling and the listing-type
 * label. Every design calls this once, so they all behave the same.
 */
export function useCardState(property: Property) {
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

  const sortedImages = (property.images ?? []).slice().sort((a, b) => a.order - b.order);
  const carouselImages = sortedImages.slice(0, 5);
  const totalImages = property.images?.length ?? 0;
  const favorite = isFavorite(property.id);

  const propertyUrl = useMemo(() => buildPropertyUrl(property, config) || '#', [property, config]);

  const handleClick = useCallback((e?: MouseEvent) => {
    // Ctrl / Cmd / Shift / middle click on the card: new tab, like a link.
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) && !config.onPropertyClick) {
      window.open(propertyUrl, '_blank', 'noopener');
      return;
    }
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
      if (propertyUrl !== '#') window.location.href = propertyUrl;
    }
  }, [config, property, currentPage, propertyUrl]);

  // The title link: a plain click goes through handleClick (keeps the "back to
  // results" context); modified clicks are left to the browser.
  const handleLinkClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    handleClick();
  }, [handleClick]);

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

  return {
    property,
    t,
    config,
    priceFormatter,
    carouselImages,
    totalImages,
    favorite,
    heartBounce,
    slideIndex,
    loadedSlides,
    propertyUrl,
    handleClick,
    handleLinkClick,
    handleFavoriteClick,
    prevSlide,
    nextSlide,
    handleTouchStart,
    handleTouchEnd,
    listingLabelKey,
    listingFallback,
  };
}

export type CardState = ReturnType<typeof useCardState>;
