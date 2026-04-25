import RsLocation from '@/components/search/RsLocation';
import RsListingType from '@/components/search/RsListingType';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsPrice from '@/components/search/RsPrice';
import RsSearchButton from '@/components/search/RsSearchButton';

export default function SearchTemplate02() {
  return (
    <div class="rs-search-template-02">
      <div class="rs-search-tabbed">
        <RsListingType variation={3} />
        <div class="rs-search-row">
          <RsLocation variation={1} />
          <RsPropertyType variation={2} />
          <RsBedrooms variation={1} />
          <RsPrice variation={1} />
          <RsSearchButton />
        </div>
      </div>
    </div>
  );
}
