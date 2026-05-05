import RsReference from '@/components/search/RsReference';
import RsLocation from '@/components/search/RsLocation';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsBathrooms from '@/components/search/RsBathrooms';
import RsPrice from '@/components/search/RsPrice';
import RsListingType from '@/components/search/RsListingType';
import RsFeatures from '@/components/search/RsFeatures';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsResetButton from '@/components/search/RsResetButton';

export default function SearchTemplate01() {
  return (
    <div class="rs-search-template-01">
      <div class="rs-search-row">
        <RsReference />
        <RsLocation variation={2} />
        <RsPropertyType variation={2} />
        <RsSearchButton />
      </div>
      <div class="rs-search-row">
        <RsBedrooms variation={1} />
        <RsBathrooms variation={1} />
        <RsPrice variation={1} />
        <RsListingType variation={2} />
        <RsFeatures variation={1} />
        <RsResetButton />
      </div>
      <div class="rs-t01-mobile-actions">
        <RsSearchButton />
        <RsResetButton />
      </div>
    </div>
  );
}
