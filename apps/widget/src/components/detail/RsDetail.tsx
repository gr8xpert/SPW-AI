import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsDetailGallery from './RsDetailGallery';
import RsDetailTitle from './RsDetailTitle';
import RsDetailPrice from './RsDetailPrice';
import RsDetailDescription from './RsDetailDescription';
import RsDetailFeatures from './RsDetailFeatures';
import RsDetailSpecs from './RsDetailSpecs';
import RsDetailMap from './RsDetailMap';
import RsDetailRelated from './RsDetailRelated';
import RsDetailAgent from './RsDetailAgent';
import RsDetailInquiryForm from './RsDetailInquiryForm';
import RsDetailShare from './RsDetailShare';
import RsDetailWishlist from './RsDetailWishlist';
import RsDetailBack from './RsDetailBack';

export default function RsDetail() {
  const property = useSelector(selectors.getSelectedProperty);

  if (!property) {
    return null;
  }

  return (
    <div class="rs-detail">
      <div class="rs-detail__header">
        <RsDetailBack />
        <div class="rs-detail__actions">
          <RsDetailShare property={property} />
          <RsDetailWishlist propertyId={property.id} />
        </div>
      </div>

      <RsDetailGallery images={property.images} />

      <div class="rs-detail__content">
        <div class="rs-detail__main">
          <RsDetailTitle title={property.title} />
          <RsDetailPrice
            price={property.price}
            currency={property.currency}
            priceOnRequest={property.priceOnRequest}
          />
          <RsDetailDescription description={property.description} />
          <RsDetailSpecs property={property} />
          <RsDetailFeatures features={property.features} />
          <RsDetailMap lat={property.lat} lng={property.lng} />
          <RsDetailRelated />
        </div>

        <div class="rs-detail__sidebar">
          {property.agent && <RsDetailAgent agent={property.agent} />}
          <RsDetailInquiryForm property={property} />
        </div>
      </div>
    </div>
  );
}
