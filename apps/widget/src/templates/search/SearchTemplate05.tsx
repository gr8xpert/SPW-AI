import { useLabels } from '@/hooks/useLabels';
import RsLocation from '@/components/search/RsLocation';
import RsListingType from '@/components/search/RsListingType';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsBathrooms from '@/components/search/RsBathrooms';
import RsPrice from '@/components/search/RsPrice';
import RsFeatures from '@/components/search/RsFeatures';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsResetButton from '@/components/search/RsResetButton';

export default function SearchTemplate05() {
  const { t } = useLabels();

  return (
    <div class="rs-search-template-05">
      <div class="rs-t05-card">
        <div class="rs-t05-header">
          <RsListingType variation={1} />
        </div>

        <div class="rs-t05-body">
          <div class="rs-t05-section">
            <div class="rs-t05-section__label">{t('location_label', 'Location')}</div>
            <RsLocation variation={1} />
          </div>

          <div class="rs-t05-section">
            <div class="rs-t05-section__label">{t('property_type', 'Property Type')}</div>
            <RsPropertyType variation={4} />
          </div>

          <div class="rs-t05-row">
            <div class="rs-t05-section">
              <div class="rs-t05-section__label">{t('bedrooms_label', 'Beds')}</div>
              <RsBedrooms variation={1} />
            </div>
            <div class="rs-t05-section">
              <div class="rs-t05-section__label">{t('bathrooms_label', 'Baths')}</div>
              <RsBathrooms variation={1} />
            </div>
          </div>

          <div class="rs-t05-section rs-t05-section--price">
            <div class="rs-t05-section__label">{t('price_label', 'Price Range')}</div>
            <RsPrice variation={2} />
          </div>

          <div class="rs-t05-section rs-t05-section--features">
            <RsFeatures variation={1} />
          </div>
        </div>

        <div class="rs-t05-footer">
          <RsResetButton variation={2} />
          <RsSearchButton />
        </div>
      </div>
    </div>
  );
}
