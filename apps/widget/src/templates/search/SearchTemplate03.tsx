import RsLocation from '@/components/search/RsLocation';
import RsListingType from '@/components/search/RsListingType';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsBathrooms from '@/components/search/RsBathrooms';
import RsPrice from '@/components/search/RsPrice';
import RsReference from '@/components/search/RsReference';
import RsFeatures from '@/components/search/RsFeatures';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsResetButton from '@/components/search/RsResetButton';
import RsAiSearch from '@/components/search/RsAiSearch';
import RsAiActions from '@/components/search/RsAiActions';

export default function SearchTemplate03() {
  return (
    <div class="rs-search-template-03">
      <RsAiSearch badge={false} />
      <RsListingType variation={1} />
      <div class="rs-search-row rs-search-row--inline rs-t03-fields">
        <RsReference />
        <RsPropertyType variation={2} />
        <RsLocation variation={4} />
        <RsBedrooms variation={1} />
        <RsBathrooms variation={1} />
      </div>
      <div class="rs-search-row rs-t03-actions">
        <RsPrice variation={1} />
        <RsFeatures variation={1} />
        <RsSearchButton />
        <RsResetButton />
        <RsAiActions />
      </div>
    </div>
  );
}
