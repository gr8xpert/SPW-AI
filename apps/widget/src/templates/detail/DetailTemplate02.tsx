// Property page design 02: a full-width photo, then the title, summary and
// description beside a sticky price / agent / inquiry column, the highlights
// (facts), the features as buttons, the actions (purchase costs, share, brochure, EPC), a
// photo grid, the map — and below the map only similar properties.
import { useEffect, useState } from 'preact/hooks';
import { useSelector } from '@/hooks/useStore';
import { useLabels } from '@/hooks/useLabels';
import { selectors } from '@/core/selectors';
import { getDataLoader } from '@/core/data-loader';
import { actions } from '@/core/actions';
import RsDetailTitle from '@/components/detail/RsDetailTitle';
import RsDetailPrice from '@/components/detail/RsDetailPrice';
import RsDetailDescription from '@/components/detail/RsDetailDescription';
import RsDetailVideoEmbed from '@/components/detail/RsDetailVideoEmbed';
import RsDetailTourEmbed from '@/components/detail/RsDetailTourEmbed';
import RsDetailMap from '@/components/detail/RsDetailMap';
import RsDetailRelated from '@/components/detail/RsDetailRelated';
import RsDetailInquiryForm from '@/components/detail/RsDetailInquiryForm';
import RsDetailWishlist from '@/components/detail/RsDetailWishlist';
import RsDetailAgent from '@/components/detail/RsDetailAgent';
import RsDetailBack from '@/components/detail/RsDetailBack';
import RsDetailLightbox from '@/components/detail/RsDetailLightbox';
import RsDetailStatus from '@/components/detail/RsDetailStatus';
import RsDetailType from '@/components/detail/RsDetailType';
import RsDetailRef from '@/components/detail/RsDetailRef';
import Skeleton from '@/components/common/Skeleton';
import { ActionRow, FeatureButtons, Highlights, PhotoGrid, SummaryLine, TypeHeading } from './Detail02Parts';

export default function DetailTemplate02() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  const [lightbox, setLightbox] = useState<number | null>(null);

  // A property picked from search results is thin (5 photos): load it in full.
  useEffect(() => {
    if (!property || property.__detailFull) return;
    const loader = getDataLoader();
    if (!loader) return;
    let cancelled = false;
    loader.getProperty(property.reference).then((full) => {
      if (!cancelled) actions.setSelectedProperty(full);
    }).catch(() => { /* leave thin data in place */ });
    return () => { cancelled = true; };
  }, [property?.reference, property?.__detailFull]);

  if (!property) {
    return (
      <div class="rs-detail rs-detail-02">
        <Skeleton type="card" count={1} />
      </div>
    );
  }

  const images = (property.images ?? []).slice().sort((a, b) => a.order - b.order);
  const hero = images[0];

  return (
    <div class="rs-detail rs-detail-02">
      <div class="rs-d02-hero rs-detail__gallery-wrap">
        <div class="rs-detail__gallery-badges">
          <RsDetailStatus />
          <RsDetailType />
          <RsDetailRef />
        </div>
        <div class="rs-detail__gallery-heart rs-d02-hero__heart">
          <RsDetailWishlist propertyId={property.id} />
        </div>
        {hero ? (
          <button type="button" class="rs-d02-hero__image" onClick={() => setLightbox(0)} aria-label={t('detail_photos', '{count} photos').replace('{count}', String(images.length))}>
            <img src={hero.url} alt={hero.alt || property.title} fetchpriority="high" decoding="async" />
          </button>
        ) : (
          <div class="rs-d02-hero__image rs-d02-hero__image--empty" />
        )}
        {images.length > 1 && (
          <button type="button" class="rs-d02-hero__count" onClick={() => setLightbox(0)}>
            {t('detail_photos', '{count} photos').replace('{count}', String(images.length))}
          </button>
        )}
      </div>

      <div class="rs-d02-body">
        <div class="rs-d02-main">
          <div class="rs-d02-back"><RsDetailBack /></div>
          <header class="rs-d02-intro">
            <RsDetailTitle title={property.pageTitle || property.title} />
            <SummaryLine property={property} t={t} />
          </header>
          <TypeHeading property={property} t={t} />
          <RsDetailDescription description={property.description} />
          <Highlights property={property} t={t} />
          <FeatureButtons property={property} t={t} />
          <ActionRow property={property} t={t} />
          <PhotoGrid images={images} onOpen={setLightbox} t={t} />
          {property.videoUrl && <RsDetailVideoEmbed />}
          {property.virtualTourUrl && <RsDetailTourEmbed />}
        </div>

        <aside class="rs-d02-side">
          <div class="rs-d02-side__sticky">
            <div class="rs-d02-side__price">
              <RsDetailPrice price={property.price} currency={property.currency} priceOnRequest={property.priceOnRequest} />
            </div>
            <RsDetailAgent />
            <RsDetailInquiryForm property={property} />
          </div>
        </aside>
      </div>

      <div class="rs-d02-map">
        <RsDetailMap lat={property.lat} lng={property.lng} />
      </div>

      <RsDetailRelated />

      {lightbox != null && images.length > 0 && (
        <RsDetailLightbox images={images} start={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
