// Full-screen photo viewer opened at a given photo (detail design 02's hero
// and photo grid). Same markup and classes as RsDetailGallery's lightbox, so
// it looks the same and site CSS for it applies.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { useLabels } from '@/hooks/useLabels';
import type { PropertyImage } from '@/types';

interface Props {
  images: PropertyImage[];
  start: number;
  onClose: () => void;
}

export default function RsDetailLightbox({ images, start, onClose }: Props) {
  const { t } = useLabels();
  const [index, setIndex] = useState(start);
  const touchX = useRef(0);
  const count = images.length;

  const prev = useCallback((e?: Event) => {
    e?.stopPropagation();
    setIndex((i) => (i > 0 ? i - 1 : count - 1));
  }, [count]);
  const next = useCallback((e?: Event) => {
    e?.stopPropagation();
    setIndex((i) => (i < count - 1 ? i + 1 : 0));
  }, [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [prev, next, onClose]);

  const current = images[index] ?? images[0];
  if (!current || typeof document === 'undefined') return null;

  return createPortal(
    <div
      class="rs-detail-gallery__lightbox rs-backdrop-enter"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const diff = touchX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) (diff > 0 ? next : prev)();
      }}
    >
      <div class="rs-detail-gallery__lightbox-content rs-modal-enter" onClick={(e) => e.stopPropagation()}>
        <button class="rs-detail-gallery__lightbox-close" type="button" onClick={onClose} aria-label={t('close', 'Close')}>&times;</button>
        {count > 1 && (
          <button class="rs-detail-gallery__lightbox-prev" type="button" onClick={prev} aria-label={t('pagination_prev', 'Previous')}>&#8249;</button>
        )}
        <img src={current.url} alt={current.alt ?? ''} class="rs-detail-gallery__lightbox-image" />
        {count > 1 && (
          <button class="rs-detail-gallery__lightbox-next" type="button" onClick={next} aria-label={t('pagination_next', 'Next')}>&#8250;</button>
        )}
        <div class="rs-detail-gallery__lightbox-counter">{index + 1} / {count}</div>
      </div>
    </div>,
    document.body,
  );
}
