// Share icon beside the wishlist heart (Website → Share icon on listing
// cards). It shares the listing's own property page, so WhatsApp/Facebook
// show the same preview as sharing from the property page itself.
import { useEffect, useRef, useState } from 'preact/hooks';
import RsFloating, { isOutsideField } from '@/components/common/RsFloating';
import RsShareButtons from '@/components/utility/RsShareButtons';
import type { CardState } from './useCardState';

interface Props {
  s: CardState;
  size: number;
  // The design's own heart classes: the icon takes the heart's look and
  // position, and CSS moves it beside the heart (.rs-card-share).
  className: string;
}

function absoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

export function ShareIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export default function CardShare({ s, size, className }: Props) {
  const { t, config, property, propertyUrl } = s;
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (isOutsideField(btnRef.current, e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (config.cardShareIcon !== true || propertyUrl === '#') return null;

  const url = absoluteUrl(propertyUrl);
  const solo = config.enableFavorites === false;

  const onClick = (e: MouseEvent) => {
    // The card (or its link) around the icon must not open the listing.
    e.preventDefault();
    e.stopPropagation();
    // Phones: the system share sheet (WhatsApp, Messages, …).
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof navigator.share === 'function') {
      navigator.share({ title: property.title, url }).catch(() => { /* cancelled */ });
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        class={`${className} rs-card-share${solo ? ' rs-card-share--solo' : ''}`}
        aria-label={t('card_share', 'Share this property')}
        aria-expanded={open}
        title={t('card_share', 'Share this property')}
        onClick={onClick}
      >
        <ShareIcon size={size} />
      </button>
      {open && (
        <RsFloating anchorRef={btnRef} matchWidth={false} minWidth={250}>
          <div class="rs-card-share__panel" onClick={(e) => e.stopPropagation()}>
            <RsShareButtons url={url} title={property.title} />
          </div>
        </RsFloating>
      )}
    </>
  );
}
