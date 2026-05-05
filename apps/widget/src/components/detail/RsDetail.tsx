import { useSelector } from '@/hooks/useStore';
import { useConfig } from '@/hooks/useConfig';
import { selectors } from '@/core/selectors';
import RsDetailGallery from './RsDetailGallery';
import RsDetailTitle from './RsDetailTitle';
import RsDetailPrice from './RsDetailPrice';
import RsDetailRef from './RsDetailRef';
import RsDetailLocation from './RsDetailLocation';
import RsDetailAddress from './RsDetailAddress';
import RsDetailType from './RsDetailType';
import RsDetailStatus from './RsDetailStatus';
import RsDetailDescription from './RsDetailDescription';
import RsDetailFeatures from './RsDetailFeatures';
import RsDetailSpecs from './RsDetailSpecs';
import RsDetailResources from './RsDetailResources';
import RsDetailVideoEmbed from './RsDetailVideoEmbed';
import RsDetailTourEmbed from './RsDetailTourEmbed';
import RsDetailMap from './RsDetailMap';
import RsDetailRelated from './RsDetailRelated';
import RsDetailAgent from './RsDetailAgent';
import RsDetailInquiryForm from './RsDetailInquiryForm';
import RsDetailShare from './RsDetailShare';
import RsDetailWishlist from './RsDetailWishlist';
import RsDetailBack from './RsDetailBack';
import RsMortgageCalculator from '@/components/utility/RsMortgageCalculator';

export default function RsDetail() {
  const config = useConfig();
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
          <div class="rs-detail__title-block">
            <RsDetailTitle title={property.title} />
            <div class="rs-detail__meta">
              <RsDetailStatus />
              <RsDetailType />
              <RsDetailRef />
            </div>
          </div>

          <RsDetailPrice
            price={property.price}
            currency={property.currency}
            priceOnRequest={property.priceOnRequest}
          />

          <div class="rs-detail__location-block">
            <RsDetailLocation />
            <RsDetailAddress />
          </div>

          <RsDetailSpecs property={property} />
          <RsDetailDescription description={property.description} />
          <RsDetailFeatures features={property.features} />
          <RsDetailResources />
          {property.videoUrl && <RsDetailVideoEmbed />}
          {property.virtualTourUrl && <RsDetailTourEmbed />}
          <RsDetailMap lat={property.lat} lng={property.lng} />
          <RsDetailRelated />
        </div>

        <div class="rs-detail__sidebar">
          {property.agent && <RsDetailAgent agent={property.agent} />}
          <RsDetailInquiryForm property={property} />
          {config.enableMortgageCalculator !== false && !property.priceOnRequest && (
            <RsMortgageCalculator price={property.price} currency={property.currency} />
          )}
        </div>
      </div>
    </div>
  );
}
