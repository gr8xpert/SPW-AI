import RsLocation from '@/components/search/RsLocation';
import RsListingType from '@/components/search/RsListingType';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsBathrooms from '@/components/search/RsBathrooms';
import RsPrice from '@/components/search/RsPrice';
import RsBuiltArea from '@/components/search/RsBuiltArea';
import RsPlotSize from '@/components/search/RsPlotSize';
import RsFeatures from '@/components/search/RsFeatures';
import RsQuickFeatures from '@/components/search/RsQuickFeatures';
import RsReference from '@/components/search/RsReference';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsResetButton from '@/components/search/RsResetButton';

export default function SearchTemplate05() {
  return (
    <div class="rs-search-template-05">
      <div class="rs-search-full">
        <RsListingType variation={3} />
        <div class="rs-search-full__main">
          <RsLocation variation={1} />
          <RsPropertyType variation={2} />
          <RsBedrooms variation={1} />
          <RsBathrooms variation={1} />
          <RsPrice variation={1} />
        </div>
        <div class="rs-search-full__extras">
          <RsBuiltArea variation={1} />
          <RsPlotSize variation={1} />
          <RsReference />
          <RsFeatures variation={1} />
        </div>
        <RsQuickFeatures />
        <div class="rs-search-stack__actions">
          <RsResetButton />
          <RsSearchButton />
        </div>
      </div>
    </div>
  );
}
