import { useState, useCallback, useEffect } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { useConfig } from '@/hooks/useConfig';
import { useLabels } from '@/hooks/useLabels';
import { selectors } from '@/core/selectors';
import RsDetailBack from '@/components/detail/RsDetailBack';
import RsDetailGallery from '@/components/detail/RsDetailGallery';
import RsDetailTitle from '@/components/detail/RsDetailTitle';
import RsDetailPrice from '@/components/detail/RsDetailPrice';
import RsDetailRef from '@/components/detail/RsDetailRef';
import RsDetailLocation from '@/components/detail/RsDetailLocation';
import RsDetailAddress from '@/components/detail/RsDetailAddress';
import RsDetailType from '@/components/detail/RsDetailType';
import RsDetailStatus from '@/components/detail/RsDetailStatus';
import RsDetailSpecs from '@/components/detail/RsDetailSpecs';
import RsDetailDescription from '@/components/detail/RsDetailDescription';
import RsDetailVideoEmbed from '@/components/detail/RsDetailVideoEmbed';
import RsDetailTourEmbed from '@/components/detail/RsDetailTourEmbed';
import RsDetailMap from '@/components/detail/RsDetailMap';
import RsDetailRelated from '@/components/detail/RsDetailRelated';
import RsDetailInquiryForm from '@/components/detail/RsDetailInquiryForm';
import RsDetailWishlist from '@/components/detail/RsDetailWishlist';
import RsDetailPdf from '@/components/detail/RsDetailPdf';
import RsMortgageCalculator from '@/components/utility/RsMortgageCalculator';
import Skeleton from '@/components/common/Skeleton';
import type { Feature } from '@/types';

function FeaturesModal({ features, onClose }: { features: Feature[]; onClose: () => void }) {
  const { t } = useLabels();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const grouped = new Map<string, Feature[]>();
  for (const f of features) {
    const cat = f.category || 'General';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(f);
  }

  return (
    <div class="rs-features-modal__backdrop" onMouseDown={onClose}>
      <div class="rs-features-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div class="rs-features-modal__header">
          <div class="rs-features-modal__title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <h3>{t('detail_features', 'Features')}</h3>
            <span class="rs-features-modal__count">({features.length})</span>
          </div>
          <button class="rs-features-modal__close" type="button" onClick={onClose}>
            &times;
          </button>
        </div>
        <div class="rs-features-modal__body">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category} class="rs-features-modal__group">
              <div class="rs-features-modal__category">
                <span>{category}</span>
              </div>
              <div class="rs-features-modal__items">
                {items.map((f) => (
                  <span key={f.id} class="rs-features-modal__item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SidebarShare({ url, title }: { url: string; title: string }) {
  const { t } = useLabels();
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }, [url]);

  return (
    <div class="rs-sidebar-share">
      <span class="rs-sidebar-share__label">{t('detail_share', 'Share')}</span>
      <div class="rs-sidebar-share__icons">
        <a class="rs-sidebar-share__icon" href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </a>
        <a class="rs-sidebar-share__icon" href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </a>
        <a class="rs-sidebar-share__icon" href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="X">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
        <a class="rs-sidebar-share__icon" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
        </a>
        <a class="rs-sidebar-share__icon" href={`mailto:?subject=${encodedTitle}&body=${encodedUrl}`} aria-label="Email">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </a>
        <button type="button" class="rs-sidebar-share__icon" onClick={copyLink} aria-label="Copy Link">
          {copied ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

function MortgageButton({ price, currency }: { price: number; currency: string }) {
  const { t } = useLabels();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button class="rs-sidebar-mortgage-btn" type="button" onClick={() => setOpen(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <path d="M2 9h20" />
          <path d="M10 3v18" />
        </svg>
        {t('mortgage_title', 'Mortgage Calculator')}
      </button>
      {open && (
        <div class="rs-features-modal__backdrop" onMouseDown={() => setOpen(false)}>
          <div class="rs-features-modal rs-features-modal--sm" onMouseDown={(e) => e.stopPropagation()}>
            <div class="rs-features-modal__header">
              <div class="rs-features-modal__title">
                <h3>{t('mortgage_title', 'Mortgage Calculator')}</h3>
              </div>
              <button class="rs-features-modal__close" type="button" onClick={() => setOpen(false)}>
                &times;
              </button>
            </div>
            <div class="rs-features-modal__body">
              <RsMortgageCalculator price={price} currency={currency} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function DetailTemplate01() {
  const { t } = useLabels();
  const config = useConfig();
  const property = useSelector(selectors.getSelectedProperty);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  if (!property) {
    return (
      <div class="rs-detail">
        <Skeleton type="card" count={1} />
      </div>
    );
  }

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const featureCount = property.features?.length || 0;

  return (
    <div class="rs-detail">
      <div class="rs-detail__gallery-wrap">
        <div class="rs-detail__gallery-badges">
          <RsDetailStatus />
          <RsDetailType />
          <RsDetailRef />
        </div>
        <div class="rs-detail__gallery-heart">
          <RsDetailWishlist propertyId={property.id} />
        </div>
        <RsDetailGallery images={property.images} />
      </div>

      <div class="rs-detail__content">
        <div class="rs-detail__main">
          <div class="rs-detail__title-row">
            <div>
              <RsDetailTitle title={property.title} />
              <RsDetailPrice
                price={property.price}
                currency={property.currency}
                priceOnRequest={property.priceOnRequest}
              />
            </div>
            <div class="rs-detail__location-block rs-detail__location-block--right">
              <RsDetailLocation />
              <RsDetailAddress />
            </div>
          </div>

          <RsDetailSpecs property={property} />

          <RsDetailDescription description={property.description} />

          {property.videoUrl && <RsDetailVideoEmbed />}

          {property.virtualTourUrl && <RsDetailTourEmbed />}

          <RsDetailMap lat={property.lat} lng={property.lng} />
        </div>

        <div class="rs-detail__sidebar">
          <div class="rs-detail__sidebar-actions">
            <RsDetailBack />
            {featureCount > 0 && (
              <button class="rs-sidebar-features__btn" type="button" onClick={() => setFeaturesOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                {t('detail_features', 'Features')}
                <span class="rs-sidebar-features__count">{featureCount}</span>
              </button>
            )}
          </div>

          <RsDetailPdf />

          <RsDetailInquiryForm property={property} />

          <SidebarShare url={url} title={property.title} />

          {config.enableMortgageCalculator !== false && !property.priceOnRequest && property.price > 0 && (
            <MortgageButton price={property.price} currency={property.currency} />
          )}
        </div>
      </div>

      <RsDetailRelated />

      {featuresOpen && (
        <FeaturesModal features={property.features || []} onClose={() => setFeaturesOpen(false)} />
      )}
    </div>
  );
}
