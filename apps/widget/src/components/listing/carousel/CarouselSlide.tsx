// One slide of carousel templates 01–06. The markup and class names are the V3
// carousel's, so its CSS (styles/carousels.css) and any site overrides apply.
import { useCardState } from '../cards/useCardState';
import type { Property } from '@/types';
import type { CarouselLayout, SlideStyle } from './layouts';

interface SlideProps {
  property: Property;
  layout: CarouselLayout;
  index: number;
  // Extra classes on the slide (layout 1's level, layout 6's active card).
  className?: string;
  // Layouts 2 and 3 place every slide with an inline transform.
  placement?: SlideStyle;
  // A side card in layout 1 moves the carousel instead of opening the listing.
  onNavigate?: () => void;
}

function BedIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 4v16" /><path d="M2 8h18a2 2 0 0 1 2 2v10" /><path d="M2 17h20" /><path d="M6 8v9" />
    </svg>
  );
}

function BathIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <line x1="10" x2="8" y1="5" y2="7" /><line x1="2" x2="22" y1="12" y2="12" />
      <line x1="7" x2="7" y1="19" y2="21" /><line x1="17" x2="17" y1="19" y2="21" />
    </svg>
  );
}

export default function CarouselSlide({ property, layout, index, className = '', placement, onNavigate }: SlideProps) {
  const s = useCardState(property);
  const { t, propertyUrl, handleLinkClick, priceFormatter } = s;

  const image = (property.images ?? []).slice().sort((a, b) => a.order - b.order)[0];
  const price = property.priceOnRequest
    ? t('card_price_on_request', 'Price on Request')
    : priceFormatter(property.price);
  const iconSize = layout === 4 || layout === 5 ? 18 : 16;
  const beds = property.bedrooms != null && property.bedrooms > 0 ? property.bedrooms : 0;
  const baths = property.bathrooms != null && property.bathrooms > 0 ? property.bathrooms : 0;
  // Layout 6 spells the specs out ("3 Bedrooms"); the others show the number.
  const wordy = layout === 6;
  const specs = (beds || baths) ? (
    <div class="rs-property-carousel__card-specs">
      {beds > 0 && <span class="rs-property-carousel__card-spec"><BedIcon size={iconSize} /> {beds}{wordy ? ` ${t('card_bedrooms', 'Bedrooms')}` : ''}</span>}
      {baths > 0 && <span class="rs-property-carousel__card-spec"><BathIcon size={iconSize} /> {baths}{wordy ? ` ${t('card_bathrooms', 'Bathrooms')}` : ''}</span>}
    </div>
  ) : null;

  const onCardClick = (e: MouseEvent) => {
    if (onNavigate) {
      e.preventDefault();
      e.stopPropagation();
      onNavigate();
      return;
    }
    handleLinkClick(e);
  };

  const img = image ? (
    <img
      src={image.url}
      alt={image.alt || property.title}
      class="rs-property-carousel__card-image"
      loading="lazy"
      decoding="async"
    />
  ) : (
    <div class="rs-property-carousel__card-image rs-property-carousel__card-image--empty" />
  );

  const style = placement
    ? { transform: placement.transform, filter: placement.filter, pointerEvents: placement.pointerEvents, zIndex: placement.zIndex, opacity: placement.opacity }
    : undefined;

  if (layout === 6) {
    return (
      <div class={`rs-property-carousel__item ${className}`.trim()} data-index={index} data-property-ref={property.reference}>
        <span class="rs-property-carousel__card-number">{String(index + 1).padStart(2, '0')}</span>
        {property.propertyType?.name && <p class="rs-property-carousel__card-type">{property.propertyType.name}</p>}
        {property.location?.name && <p class="rs-property-carousel__card-location">{property.location.name}</p>}
        <a href={propertyUrl} class="rs-property-carousel__card" onClick={onCardClick}>
          <div class="rs-property-carousel__card-image-wrapper">
            {img}
            {property.isFeatured && <span class="rs-property-carousel__card-badge">{t('card_featured', 'Featured')}</span>}
          </div>
        </a>
        <div class="rs-property-carousel__card-info">
          <p class="rs-property-carousel__card-price">{price}</p>
          {specs}
        </div>
        <a href={propertyUrl} class="rs-property-carousel__card-view-btn" onClick={onCardClick}>
          {t('card_view_details', 'View Details')}
        </a>
      </div>
    );
  }

  const overlay = (
    <div class="rs-property-carousel__card-overlay" style={placement ? { opacity: placement.overlayOpacity } : undefined}>
      <h3 class="rs-property-carousel__card-title">{property.title}</h3>
      {specs}
      <p class="rs-property-carousel__card-price">{price}</p>
      <span class="rs-property-carousel__card-link">{t('card_view_details', 'View Details')} &rarr;</span>
    </div>
  );

  return (
    <div class={`rs-property-carousel__item ${className}`.trim()} data-index={index} data-property-ref={property.reference} style={style}>
      <a href={propertyUrl} class="rs-property-carousel__card" onClick={onCardClick}>
        {layout === 5 ? <div class="rs-property-carousel__card-inner">{img}{overlay}</div> : <>{img}{overlay}</>}
      </a>
    </div>
  );
}
