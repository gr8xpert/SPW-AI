import { useState, useCallback } from 'preact/hooks';
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

  if (!images?.length) {
    return <div class="rs-detail-gallery rs-detail-gallery--empty" />;
  }

  const sorted = images.slice().sort((a, b) => a.order - b.order);
  const current = sorted[activeIndex] ?? sorted[0];

  const goTo = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const prev = useCallback(() => {
    setActiveIndex((i) => (i > 0 ? i - 1 : sorted.length - 1));
  }, [sorted.length]);

  const next = useCallback(() => {
    setActiveIndex((i) => (i < sorted.length - 1 ? i + 1 : 0));
  }, [sorted.length]);

  const openLightbox = useCallback(() => {
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') closeLightbox();
    },
    [prev, next, closeLightbox],
  );

  return (
    <div class="rs-detail-gallery">
      <div
        class="rs-detail-gallery__main"
        onClick={openLightbox}
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

      {lightboxOpen && (
        <div
          class="rs-detail-gallery__lightbox rs-backdrop-enter"
          onClick={closeLightbox}
          onKeyDown={handleKeyDown}
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
        </div>
      )}
    </div>
  );
}
