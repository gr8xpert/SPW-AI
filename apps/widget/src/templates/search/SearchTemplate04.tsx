import RsLocation from '@/components/search/RsLocation';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsPrice from '@/components/search/RsPrice';
import RsSearchButton from '@/components/search/RsSearchButton';

export default function SearchTemplate04() {
  return (
    <div class="rs-search-template-04">
      <div class="rs-search-compact">
        <RsLocation variation={4} />
        <RsPropertyType variation={2} />
        <RsBedrooms variation={1} />
        <RsPrice variation={3} />
        <RsSearchButton />
      </div>
    </div>
  );
}
