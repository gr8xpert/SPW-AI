import { useState, useCallback, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { PropertyImage } from '@/types';

interface Props {
  images?: PropertyImage[];
}

export default function RsDetailGallery({ images: imagesProp }: Props) {
  const property = useSelector(selectors.getSelectedProperty);
  const images = imagesProp ?? property?.images;

  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef(0);

  if (!images?.length) {
    return <div class="rs-detail-gallery rs-detail-gallery--empty" />;
  }

  const sorted = images.slice().sort((a, b) => a.order - b.order);
  const current = sorted[activeIndex] ?? sorted[0];

  const goTo = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const prev = useCallback((e?: Event) => {
    e?.stopPropagation();
    setActiveIndex((i) => (i > 0 ? i - 1 : sorted.length - 1));
  }, [sorted.length]);

  const next = useCallback((e?: Event) => {
    e?.stopPropagation();
    setActiveIndex((i) => (i < sorted.length - 1 ? i + 1 : 0));
  }, [sorted.length]);

  const openLightbox = useCallback(() => {
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    document.body.style.overflow = '';
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') closeLightbox();
    },
    [prev, next, closeLightbox],
  );

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
  }, [next, prev]);

  return (
    <div class="rs-detail-gallery">
      <div
        class="rs-detail-gallery__main"
        onClick={openLightbox}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="button"
        tabIndex={0}
      >
        {current && (
          <img
            src={current.url}
            alt={current.alt ?? ''}
            class="rs-detail-gallery__image"
          />
        )}

        <div class="rs-detail-gallery__enlarge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9" /><line x1="14" y1="10" x2="21" y2="3" />
            <polyline points="9 21 3 21 3 15" /><line x1="10" y1="14" x2="3" y2="21" />
          </svg>
        </div>

        {sorted.length > 1 && (
          <>
            <button
              type="button"
              class="rs-detail-gallery__arrow rs-detail-gallery__arrow--prev"
              onClick={prev}
              aria-label="Previous"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button
              type="button"
              class="rs-detail-gallery__arrow rs-detail-gallery__arrow--next"
              onClick={next}
              aria-label="Next"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18" /></svg>
            </button>
          </>
        )}

        <div class="rs-detail-gallery__counter">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          {activeIndex + 1} / {sorted.length}
        </div>
      </div>

      {sorted.length > 1 && (
        <div class="rs-detail-gallery__thumbs">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              class={`rs-detail-gallery__thumb${i === activeIndex ? ' rs-detail-gallery__thumb--active' : ''}`}
              onClick={() => goTo(i)}
              type="button"
            >
              <img
                src={img.thumbnailUrl ?? img.url}
                alt={img.alt ?? ''}
              />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && createPortal(
        <div
          class="rs-detail-gallery__lightbox rs-backdrop-enter"
          onClick={closeLightbox}
          onKeyDown={handleKeyDown}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          tabIndex={0}
          role="dialog"
        >
          <div
            class="rs-detail-gallery__lightbox-content rs-modal-enter"
            onClick={(e: Event) => e.stopPropagation()}
          >
            <button
              class="rs-detail-gallery__lightbox-close"
              onClick={closeLightbox}
              type="button"
              aria-label="Close"
            >
              &times;
            </button>

            <button
              class="rs-detail-gallery__lightbox-prev"
              onClick={prev}
              type="button"
              aria-label="Previous"
            >
              &#8249;
            </button>

            {current && (
              <img
                src={current.url}
                alt={current.alt ?? ''}
                class="rs-detail-gallery__lightbox-image"
              />
            )}

            <button
              class="rs-detail-gallery__lightbox-next"
              onClick={next}
              type="button"
              aria-label="Next"
            >
              &#8250;
            </button>

            <div class="rs-detail-gallery__lightbox-counter">
              {activeIndex + 1} / {sorted.length}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
