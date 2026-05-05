import { useLabels } from '@/hooks/useLabels';
import RsLocation from '@/components/search/RsLocation';
import RsListingType from '@/components/search/RsListingType';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsBathrooms from '@/components/search/RsBathrooms';
import RsPrice from '@/components/search/RsPrice';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsResetButton from '@/components/search/RsResetButton';

export default function SearchTemplate04() {
  const { t } = useLabels();

  return (
    <div class="rs-search-template-04">
      <div class="rs-t04-listing-type">
        <RsListingType variation={1} />
      </div>
      <div class="rs-t04-capsule">
        <div class="rs-t04-segment rs-t04-segment--location">
          <span class="rs-t04-segment__label">{t('location_label', 'Location')}</span>
          <RsLocation variation={4} />
        </div>
        <div class="rs-t04-divider" />
        <div class="rs-t04-segment rs-t04-segment--type">
          <span class="rs-t04-segment__label">{t('property_type_label', 'Type')}</span>
          <RsPropertyType variation={2} />
        </div>
        <div class="rs-t04-divider" />
        <div class="rs-t04-segment rs-t04-segment--beds">
          <span class="rs-t04-segment__label">{t('bedrooms_label', 'Beds')}</span>
          <RsBedrooms variation={1} />
        </div>
        <div class="rs-t04-divider" />
        <div class="rs-t04-segment rs-t04-segment--baths">
          <span class="rs-t04-segment__label">{t('bathrooms_label', 'Baths')}</span>
          <RsBathrooms variation={1} />
        </div>
        <div class="rs-t04-divider" />
        <div class="rs-t04-segment rs-t04-segment--price">
          <span class="rs-t04-segment__label">{t('price_label', 'Price')}</span>
          <RsPrice variation={3} />
        </div>
        <div class="rs-t04-action">
          <RsSearchButton />
          <RsResetButton variation={2} />
        </div>
      </div>
    </div>
  );
}
