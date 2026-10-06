// Carousel templates 01–06, ported from the V3 widget's property carousel:
//   1 centre focus   2 3D perspective   3 coverflow
//   4 full width with Prev/Next panels  5 tilted  6 dark numbered cards
//
// A carousel always runs its own search from its data-spm-* attributes (see
// isStandalone), so it never takes over or follows the page's search.
// data-spm-autoplay="yes" turns it by itself every data-spm-interval ms.
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useBlockSearch } from '@/hooks/useBlockSearch';
import CarouselSlide from './CarouselSlide';
import { coverflowStyle, levelClass, perspectiveStyle, placedSlides, type CarouselLayout } from './layouts';
import css from '@/styles/carousels.css?inline';

// The carousel CSS travels with this module, so pages without one don't load it.
function useCarouselStyles(): void {
  useEffect(() => {
    if (document.getElementById('spm-carousel-css')) return;
    const style = document.createElement('style');
    style.id = 'spm-carousel-css';
    style.textContent = css;
    document.head.appendChild(style);
  }, []);
}

const TRUE = new Set(['', 'yes', 'true', '1', 'on']);
const MOVE_LOCK_MS = 400;
const SWIPE_PX = 50;

interface Props {
  layout: CarouselLayout;
  autoplay?: string;
  interval?: string;
  [key: string]: unknown;
}

function Arrow({ dir, layout, label, onClick }: { dir: 'left' | 'right'; layout: CarouselLayout; label: string; onClick: () => void }) {
  const left = dir === 'left';
  return (
    <button class={`rs-property-carousel__arrow rs-property-carousel__arrow--${dir}`} type="button" aria-label={label} onClick={onClick}>
      {layout === 4 && <span class="rs-property-carousel__arrow-label">{label}</span>}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        {layout === 4
          ? left
            ? <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>
            : <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>
          : <polyline points={left ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />}
      </svg>
    </button>
  );
}

export default function RsCarouselStage(props: Props) {
  const { layout } = props;
  useCarouselStyles();
  const { results, loading } = useBlockSearch(props as Record<string, unknown>, 10);
  const { t } = useLabels();
  const items = results?.data ?? [];
  const total = items.length;

  const [active, setActive] = useState(0);
  const [screenWidth, setScreenWidth] = useState(() => window.innerWidth);
  const [paused, setPaused] = useState(false);
  const lockRef = useRef(false);
  const touchX = useRef(0);

  // Layouts 2 and 3 start on the third card so there are cards on both sides.
  useEffect(() => {
    setActive((layout === 2 || layout === 3) && total > 4 ? 2 : 0);
  }, [layout, total]);

  // 2 and 3 compute their transforms from the window width.
  useEffect(() => {
    if (layout !== 2 && layout !== 3) return;
    let timer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setScreenWidth(window.innerWidth), 250);
    };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(timer); window.removeEventListener('resize', onResize); };
  }, [layout]);

  const go = useCallback((next: (current: number) => number) => {
    if (total <= 1 || lockRef.current) return;
    lockRef.current = true;
    setActive((current) => next(current));
    setTimeout(() => { lockRef.current = false; }, MOVE_LOCK_MS);
  }, [total]);
  const prev = useCallback(() => go((a) => (a - 1 + total) % total), [go, total]);
  const next = useCallback(() => go((a) => (a + 1) % total), [go, total]);

  const autoplay = typeof props.autoplay === 'string' && TRUE.has(props.autoplay.toLowerCase());
  const interval = Math.max(1500, parseInt(String(props.interval ?? ''), 10) || 5000);
  useEffect(() => {
    if (!autoplay || paused || total <= 1) return;
    const timer = setInterval(next, interval);
    return () => clearInterval(timer);
  }, [autoplay, paused, total, interval, next]);

  const rootClass = `rs-property-carousel rs-property-carousel--v${layout}`;

  if (loading && !total) {
    return (
      <div class={rootClass}>
        <div class="rs-property-carousel__track">
          <div class="rs-property-carousel__loader">
            <div class="rs-property-carousel__spinner" />
          </div>
        </div>
      </div>
    );
  }

  if (!total) {
    return (
      <div class="rs-empty-state">
        <h3 class="rs-empty-state__title">{t('results_no_results', 'No results found')}</h3>
      </div>
    );
  }

  const slides = placedSlides(layout, active, total).map(({ index, level }) => {
    const property = items[index];
    let className = '';
    let placement;
    let onNavigate: (() => void) | undefined;
    if (layout === 1) {
      className = levelClass(level);
      if (level < 0) onNavigate = prev;
      else if (level > 0) onNavigate = next;
    } else if (layout === 2) {
      placement = perspectiveStyle(level, screenWidth);
    } else if (layout === 3) {
      placement = coverflowStyle(level, screenWidth);
    } else if (layout === 6 && level === 0) {
      className = 'rs-property-carousel__item--active';
    }
    return (
      <CarouselSlide
        key={property.id}
        property={property}
        layout={layout}
        index={index}
        className={className}
        placement={placement}
        onNavigate={onNavigate}
      />
    );
  });

  const prevLabel = layout === 4 ? t('pagination_prev', 'Prev') : t('pagination_prev', 'Previous');
  const nextLabel = t('pagination_next', 'Next');
  const showDots = layout <= 3 && total > 1;

  return (
    <div
      class={rootClass}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Arrow dir="left" layout={layout} label={prevLabel} onClick={prev} />
      <div
        class="rs-property-carousel__track"
        onTouchStart={(e) => { touchX.current = e.changedTouches[0].screenX; setPaused(true); }}
        onTouchEnd={(e) => {
          const diff = touchX.current - e.changedTouches[0].screenX;
          if (Math.abs(diff) > SWIPE_PX) (diff > 0 ? next : prev)();
          setPaused(false);
        }}
      >
        <div class="rs-property-carousel__items">{slides}</div>
      </div>
      <Arrow dir="right" layout={layout} label={nextLabel} onClick={next} />
      {showDots && (
        <div class="rs-property-carousel__dots">
          {items.map((p, i) => (
            <button
              key={p.id}
              type="button"
              class={`rs-property-carousel__dot${i === active ? ' rs-property-carousel__dot--active' : ''}`}
              aria-label={`${i + 1} / ${total}`}
              onClick={() => i !== active && go(() => i)}
            />
          ))}
        </div>
      )}
      {layout === 4 && (
        <div class="rs-property-carousel__counter">
          <span class="rs-property-carousel__counter-current">{active + 1}</span>/<span class="rs-property-carousel__counter-total">{total}</span>
        </div>
      )}
    </div>
  );
}
