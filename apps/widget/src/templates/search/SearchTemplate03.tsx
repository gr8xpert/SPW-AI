import RsLocation from '@/components/search/RsLocation';
import RsListingType from '@/components/search/RsListingType';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsBathrooms from '@/components/search/RsBathrooms';
import RsPrice from '@/components/search/RsPrice';
import RsBuiltArea from '@/components/search/RsBuiltArea';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsResetButton from '@/components/search/RsResetButton';

export default function SearchTemplate03() {
  return (
    <div class="rs-search-template-03">
      <div class="rs-search-stack">
        <RsListingType variation={1} />
        <div class="rs-search-stack__row">
          <RsLocation variation={1} />
          <RsPropertyType variation={2} />
        </div>
        <div class="rs-search-stack__row">
          <RsBedrooms variation={1} />
          <RsBathrooms variation={1} />
          <RsPrice variation={1} />
        </div>
        <div class="rs-search-stack__row">
          <RsBuiltArea variation={1} />
        </div>
        <div class="rs-search-stack__actions">
          <RsResetButton />
          <RsSearchButton />
        </div>
      </div>
    </div>
  );
}
