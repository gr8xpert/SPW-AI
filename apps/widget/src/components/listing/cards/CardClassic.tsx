// Listing templates 13–17: the V3 listing templates 07–11, with V3's markup and
// class names (rs_card_*, rs-template-card-07..11, rs-card__*), so the V3 CSS
// in styles/listing-classic.css and any site overrides written for V3 apply.
import { useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import RsWishlistIcon from '@/components/common/RsWishlistIcon';
import { getDisplayReference } from '@/core/property-display';
import css from '@/styles/listing-classic.css?inline';
import { useCardState, type CardProps, type CardState } from './useCardState';
import { CardPrice } from './CardParts';

// V2 template number → V3 design number (its class names).
const DESIGN: Record<number, number> = { 13: 7, 14: 8, 15: 9, 16: 10, 17: 11 };

const TAG_CLASS: Record<string, string> = {
  sale: 'rs-card__tag--sale',
  development: 'rs-card__tag--development',
  rent: 'rs-card__tag--rental',
  holiday_rent: 'rs-card__tag--holiday',
  offplan: 'rs-card__tag--offplan',
};

// The CSS is only needed once one of these cards is on the page.
function useClassicCss() {
  useEffect(() => {
    if (document.getElementById('spm-listing-classic-css')) return;
    const style = document.createElement('style');
    style.id = 'spm-listing-classic-css';
    style.textContent = css;
    document.head.appendChild(style);
  }, []);
}

// Buttons sit inside the card's link: they must not follow it.
const inLink = (fn: (e: Event) => void) => (e: Event) => {
  e.preventDefault();
  fn(e);
};

const ICONS = {
  beds: <><path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v9" /></>,
  baths: <><path d="M4 12h16a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3a1 1 0 0 1 1-1z" /><path d="M6 12V5a2 2 0 0 1 2-2h3v2.25" /><circle cx="12" cy="5" r="2" /></>,
  built: <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></>,
  plot: <><path d="M3 6l9-4 9 4v12l-9 4-9-4V6z" /><path d="M12 2v20" /></>,
};

function Specs({ s, n, size }: { s: CardState; n: string; size: number }) {
  const { property: p, t } = s;
  // Sizes arrive as decimal strings ("0.00"), so compare as numbers.
  const n0 = (v: unknown) => Math.round(Number(v) || 0);
  const rows: [keyof typeof ICONS, string | null][] = [
    ['beds', n0(p.bedrooms) ? `${n0(p.bedrooms)} ${t('card_bedrooms', 'Beds')}` : null],
    ['baths', n0(p.bathrooms) ? `${n0(p.bathrooms)} ${t('card_bathrooms', 'Baths')}` : null],
    ['built', n0(p.buildSize) ? `${n0(p.buildSize)} m²` : null],
    ['plot', n0(p.plotSize) ? `${n0(p.plotSize)} m²` : null],
  ];
  return (
    <>
      {rows.map(([key, text]) => text && (
        <span key={key} class={`rs-template-card-${n}__spec`}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">{ICONS[key]}</svg>
          <span class={`rs_card_${key}`}>{text}</span>
        </span>
      ))}
    </>
  );
}

function Slides({ s }: { s: CardState }) {
  const { property, carouselImages, loadedSlides, slideIndex, prevSlide, nextSlide } = s;
  if (!carouselImages.length) return <div class="rs_card_carousel" />;
  return (
    <div class="rs_card_carousel">
      <div class="rs-card__carousel">
        <div class="rs-card__carousel-track">
          {carouselImages.map((img, i) => (
            <div key={img.id} class={`rs-card__carousel-slide${i === slideIndex ? ' rs-card__carousel-slide--active' : ''}`}>
              <img
                src={loadedSlides.has(i) ? (img.thumbnailUrl || img.url) : undefined}
                alt={img.alt || property.title}
                loading="lazy"
                decoding="async"
              />
            </div>
          ))}
        </div>
        {carouselImages.length > 1 && (
          <>
            <button class="rs-card__carousel-prev" type="button" aria-label="Previous" onClick={inLink(prevSlide)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button class="rs-card__carousel-next" type="button" aria-label="Next" onClick={inLink(nextSlide)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <div class="rs-card__carousel-dots">
              {carouselImages.map((_, i) => (
                <span key={i} class={`rs-card__carousel-dot${i === slideIndex ? ' rs-card__carousel-dot--active' : ''}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Status({ s, n }: { s: CardState; n: string }) {
  const { property, t, listingLabelKey, listingFallback } = s;
  return (
    <div class={`rs_card_status rs-template-card-${n}__status`}>
      <span class={`rs-card__tag ${TAG_CLASS[property.listingType] || TAG_CLASS.sale}`}>{t(listingLabelKey, listingFallback)}</span>
      {property.isFeatured && <span class="rs-card__tag rs-card__tag--featured">{t('card_featured', 'Featured')}</span>}
      {property.isOwnProperty && <span class="rs-card__tag rs-card__tag--own">{t('card_own', 'Own')}</span>}
    </div>
  );
}

function Wishlist({ s, n }: { s: CardState; n: string }) {
  const { config, favorite, handleFavoriteClick } = s;
  if (config.enableFavorites === false) return null;
  return (
    <button
      class={`rs_card_wishlist rs-template-card-${n}__wishlist rs-card__wishlist${favorite ? ' rs-card__wishlist--active' : ''}`}
      type="button"
      aria-label="Toggle favorite"
      onClick={inLink(handleFavoriteClick)}
    >
      <RsWishlistIcon size={18} filled={favorite} />
    </button>
  );
}

function ImageCount({ s, n }: { s: CardState; n: string }) {
  if (!(s.totalImages > 0)) return null;
  return (
    <div class={`rs-template-card-${n}__image-count`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      <span class="rs_card_image_count">{s.totalImages}</span>
    </div>
  );
}

function Shell({ s, n, index, children }: { s: CardState; n: string; index: number; children: ComponentChildren }) {
  const { property, propertyUrl, handleLinkClick, handleTouchStart, handleTouchEnd } = s;
  return (
    <div
      class={`rs_card rs-card rs-template-card-${n} rs-card-enter`}
      style={`--i:${index}`}
      role="article"
      data-property-ref={property.reference}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <a class={`rs_card_link rs-template-card-${n}__link`} href={propertyUrl} onClick={handleLinkClick} title={property.title}>
        {children}
      </a>
    </div>
  );
}

function ClassicCard({ property, index = 0, template }: CardProps & { template: number }) {
  useClassicCss();
  const s = useCardState(property);
  const { t, config } = s;
  const design = DESIGN[template];
  const n = String(design).padStart(2, '0');
  const c = (part: string) => `rs-template-card-${n}__${part}`;
  const description = property.shortDescription || property.description;
  const price = <CardPrice s={s} />;
  const ref = getDisplayReference(property, config);
  const view = t('card_view_details', 'View Details');

  if (design === 7) {
    return (
      <Shell s={s} n={n} index={index}>
        <div class={c('image-section')}>
          <Slides s={s} />
          <div class={c('gradient')} />
        </div>
        <div class={c('badges')}><Status s={s} n={n} /></div>
        <Wishlist s={s} n={n} />
        <div class={c('content')}>
          <div class={c('price-row')}>
            <span class={`rs_card_price ${c('price')}`}>{price}</span>
          </div>
          <h3 class={`rs_card_type ${c('title')}`}>{property.propertyType?.name || property.title}</h3>
          <div class={c('specs')}><Specs s={s} n={n} size={16} /></div>
        </div>
      </Shell>
    );
  }

  const image = (
    <div class={c('image-section')}>
      <Slides s={s} />
      <Status s={s} n={n} />
      <Wishlist s={s} n={n} />
      <ImageCount s={s} n={n} />
    </div>
  );

  if (design === 8) {
    return (
      <Shell s={s} n={n} index={index}>
        {image}
        <div class={c('content')}>
          <h3 class={`rs_card_title ${c('title')}`}>{property.title}</h3>
          <div class={c('specs')}>
            <Specs s={s} n={n} size={16} />
            <span class={`rs_card_price ${c('price')}`}>{price}</span>
          </div>
        </div>
      </Shell>
    );
  }

  if (design === 9) {
    return (
      <Shell s={s} n={n} index={index}>
        {image}
        <div class={c('content')}>
          <div class={c('location-row')}><span class={`rs_card_location ${c('location')}`}>{property.location?.name}</span></div>
          <div class={c('ref-row')}><span class={`rs_card_ref ${c('ref')}`}>{ref}</span></div>
          <h3 class={`rs_card_title ${c('title')}`}>{property.title}</h3>
          {description && <p class={`rs_card_description ${c('description')}`}>{description}</p>}
          <div class={c('specs')}><Specs s={s} n={n} size={18} /></div>
          <div class={`rs_card_price ${c('price')}`}>{price}</div>
        </div>
      </Shell>
    );
  }

  if (design === 10) {
    return (
      <Shell s={s} n={n} index={index}>
        {image}
        <div class={c('content')}>
          <h3 class={`rs_card_title ${c('title')}`}>{property.title}</h3>
          {description && <p class={`rs_card_description ${c('description')}`}>{description}</p>}
          <div class={c('price-row')}><span class={`rs_card_price ${c('price')}`}>{price}</span></div>
          <div class={c('specs')}><Specs s={s} n={n} size={18} /></div>
          <div class={c('actions')}>
            <span class={`rs_card_ref ${c('ref-btn')}`}>{ref}</span>
            <span class={`rs_card_view ${c('view-details')}`}>{view}</span>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell s={s} n={n} index={index}>
      {image}
      <div class={c('content')}>
        <h3 class={`rs_card_title ${c('title')}`}>{property.title}</h3>
        {description && <p class={`rs_card_description ${c('description')}`}>{description}</p>}
        <div class={c('specs')}><Specs s={s} n={n} size={16} /></div>
        <div class={c('price-section')}>
          <span class={c('price-label')}>{t('card_price', 'Price')}</span>
          <span class={`rs_card_price ${c('price')}`}>{price}</span>
        </div>
        <div class={c('actions')}>
          <span class={`rs_card_view ${c('details-btn')}`}>{view}</span>
          <span class={`rs_card_ref ${c('ref')}`}>{ref}</span>
        </div>
      </div>
    </Shell>
  );
}

export const Card13 = (p: CardProps) => <ClassicCard {...p} template={13} />;
export const Card14 = (p: CardProps) => <ClassicCard {...p} template={14} />;
export const Card15 = (p: CardProps) => <ClassicCard {...p} template={15} />;
export const Card16 = (p: CardProps) => <ClassicCard {...p} template={16} />;
export const Card17 = (p: CardProps) => <ClassicCard {...p} template={17} />;
