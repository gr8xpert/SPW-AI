// Sections of property page design 02 (DetailTemplate02).
import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { useConfig } from '@/hooks/useConfig';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { formatPropertyPrice, getDisplayReference, specRange, type SpecKey } from '@/core/property-display';
import { resolveFeatures } from '@/core/feature-utils';
import { trackPdf } from '@/core/tracker';
import RsFloating, { isOutsideField } from '@/components/common/RsFloating';
import RsShareButtons from '@/components/utility/RsShareButtons';
import RsDetailPurchaseCosts from '@/components/detail/RsDetailPurchaseCosts';
import RsDetailEnergyRating from '@/components/detail/RsDetailEnergyRating';
import type { Property, PropertyImage } from '@/types';

type T = (key: string, fallback?: string) => string;

function area(p: Property, key: SpecKey): string | null {
  const v = specRange(p, key);
  return v && v !== '0' ? `${v} m²` : null;
}

/** "R123 · 5 Bedrooms · 5 Bathrooms · 1,588 m² built · 397 m² terrace · 3,110 m² plot" */
export function SummaryLine({ property, t }: { property: Property; t: T }) {
  const config = useConfig();
  const parts = [
    getDisplayReference(property, config),
    specRange(property, 'bedrooms') && `${specRange(property, 'bedrooms')} ${t('detail_bedrooms', 'Bedrooms')}`,
    specRange(property, 'bathrooms') && `${specRange(property, 'bathrooms')} ${t('detail_bathrooms', 'Bathrooms')}`,
    area(property, 'buildSize') && `${area(property, 'buildSize')} ${t('detail_built_short', 'built')}`,
    area(property, 'terraceSize') && `${area(property, 'terraceSize')} ${t('detail_terrace_short', 'terrace')}`,
    area(property, 'plotSize') && `${area(property, 'plotSize')} ${t('detail_plot_short', 'plot')}`,
  ].filter(Boolean);
  return <p class="rs-d02-summary">{parts.join(' · ')}</p>;
}

const HEADING_KEY: Record<string, [string, string]> = {
  sale: ['detail_heading_sale', '{type} for sale in {location}'],
  development: ['detail_heading_development', '{type} for sale in {location}'],
  offplan: ['detail_heading_development', '{type} for sale in {location}'],
  rent: ['detail_heading_rent', '{type} for rent in {location}'],
  holiday_rent: ['detail_heading_holiday', '{type} holiday rental in {location}'],
};

/** "Villa for sale in Sotogrande" */
export function TypeHeading({ property, t }: { property: Property; t: T }) {
  const [key, fallback] = HEADING_KEY[String(property.listingType)] ?? HEADING_KEY.sale;
  const type = property.propertyType?.name;
  const place = property.location?.name;
  if (!type || !place) return null;
  return <h2 class="rs-d02-heading">{t(key, fallback).replace('{type}', type).replace('{location}', place)}</h2>;
}

/** Facts table across the full width. */
export function Highlights({ property, t }: { property: Property; t: T }) {
  const config = useConfig();
  const { formatPrice } = useCurrency();
  const fees = Number(property.communityFees) || 0;
  const rows: [string, string | number | null | undefined][] = [
    [t('detail_ref', 'Reference'), getDisplayReference(property, config)],
    [t('detail_price', 'Price'), formatPropertyPrice(property, (n: number) => formatPrice(n, property.currency), t, t('card_price_on_request', 'Price on Request'))],
    [t('detail_property_type', 'Property Type'), property.propertyType?.name],
    [t('detail_bedrooms', 'Bedrooms'), specRange(property, 'bedrooms')],
    [t('detail_bathrooms', 'Bathrooms'), specRange(property, 'bathrooms')],
    [t('detail_built_area', 'Built Area'), area(property, 'buildSize')],
    [t('detail_terrace', 'Terrace'), area(property, 'terraceSize')],
    [t('detail_plot_size', 'Plot Size'), area(property, 'plotSize')],
    [t('detail_garden', 'Garden'), Number(property.gardenSize) > 0 ? `${Math.round(Number(property.gardenSize))} m²` : null],
    [t('detail_year_built', 'Year Built'), property.year],
    [t('detail_parking', 'Parking'), property.parking],
    [t('detail_community_fees', 'Community Fees'), fees > 0 ? `${formatPrice(fees, property.currency)}/${t('detail_per_month', 'month')}` : null],
    [t('detail_energy_rating', 'Energy Rating'), property.energyRating],
  ];
  const shown = rows.filter(([, v]) => v != null && String(v).trim() !== '' && String(v) !== '0');
  return (
    <section class="rs-d02-section rs-d02-highlights">
      <h2 class="rs-d02-section__title">{t('detail_highlights', 'Property Highlights')}</h2>
      <table class="rs-d02-facts">
        <tbody>
          {shown.map(([label, value]) => (
            <tr key={label}><th scope="row">{label}:</th><td>{value}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The listing's features: a grid of names (names from the Features list). */
export function FeatureButtons({ property, t }: { property: Property; t: T }) {
  const catalog = useSelector(selectors.getFeatures);
  const features = resolveFeatures(property.features, catalog);
  if (!features.length) return null;
  return (
    <section class="rs-d02-section rs-d02-features">
      <h2 class="rs-d02-section__title">{t('detail_features', 'Features')}</h2>
      <ul class="rs-d02-features__list">
        {features.map((f) => (
          <li key={f.id} class="rs-d02-features__item">
            {f.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShareMenu({ property, t }: { property: Property; t: T }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (isOutsideField(ref.current, e.target)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const url = typeof window !== 'undefined' ? window.location.href : '';
  return (
    <>
      <button ref={ref} type="button" class="rs-detail-action-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('detail_share', 'Share')} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <RsFloating anchorRef={ref} matchWidth={false} minWidth={250}>
          <div class="rs-card-share__panel"><RsShareButtons url={url} title={property.title} /></div>
        </RsFloating>
      )}
    </>
  );
}

function EnergyButton({ t }: { t: T }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button type="button" class="rs-detail-action-btn" onClick={() => setOpen(true)}>{t('detail_epc', 'EPC')}</button>
      {open && createPortal(
        <div class="rs-modal-backdrop rs-backdrop-enter rs-purchase-costs-modal" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div class="rs-modal-content rs-modal-enter" role="dialog" aria-modal="true">
            <div class="rs-modal-header">
              <span class="rs-modal-header__title">{t('detail_energy_rating', 'Energy Certificate')}</span>
              <button type="button" class="rs-modal-header__close" aria-label={t('close', 'Close')} onClick={() => setOpen(false)}>&times;</button>
            </div>
            <div class="rs-modal-body"><RsDetailEnergyRating /></div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** Calculate purchasing costs · Share · PDF brochure · EPC */
export function ActionRow({ property, t }: { property: Property; t: T }) {
  const config = useConfig();
  const brochure = () => {
    const base = (config.apiUrl || '').replace(/\/$/, '');
    const lang = config.language || 'en';
    window.open(`${base}/api/v1/properties/${encodeURIComponent(property.reference)}/brochure.pdf?lang=${encodeURIComponent(lang)}&apiKey=${encodeURIComponent(config.apiKey)}`, '_blank', 'noopener');
    trackPdf(property.id);
  };
  return (
    <div class="rs-d02-actions">
      <RsDetailPurchaseCosts property={property} />
      <ShareMenu property={property} t={t} />
      {config.apiUrl && config.apiKey && (
        <button type="button" class="rs-detail-action-btn" onClick={brochure}>{t('detail_brochure', 'PDF brochure')}</button>
      )}
      {property.energyRating && <EnergyButton t={t} />}
    </div>
  );
}

const GRID_PHOTOS = 10;

/** Two columns of photos; the last tile's button opens the rest. */
export function PhotoGrid({ images, onOpen, t }: { images: PropertyImage[]; onOpen: (i: number) => void; t: T }) {
  if (images.length < 2) return null;
  const tiles = images.slice(1, GRID_PHOTOS + 1);
  const rest = images.length - 1 - tiles.length;
  return (
    <section class="rs-d02-section rs-d02-photos">
      <div class="rs-d02-photos__grid">
        {tiles.map((img, i) => (
          <button key={img.id} type="button" class="rs-d02-photos__tile" onClick={() => onOpen(i + 1)}>
            <img src={img.thumbnailUrl || img.url} alt={img.alt ?? ''} loading="lazy" decoding="async" />
          </button>
        ))}
      </div>
      <div class="rs-d02-photos__more">
        <button type="button" class="rs-detail-action-btn" onClick={() => onOpen(rest > 0 ? GRID_PHOTOS + 1 : 0)}>
          {rest > 0
            ? t('detail_more_images', '+{count} images').replace('{count}', String(rest))
            : t('detail_all_images', 'All {count} images').replace('{count}', String(images.length))}
        </button>
      </div>
    </section>
  );
}
