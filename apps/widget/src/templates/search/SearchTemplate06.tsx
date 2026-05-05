import RsLocation from '@/components/search/RsLocation';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsSearchButton from '@/components/search/RsSearchButton';

export default function SearchTemplate06() {
  return (
    <div class="rs-search-template-06">
      <div class="rs-search-minimal">
        <RsLocation variation={1} />
        <RsPropertyType variation={2} />
        <RsSearchButton />
      </div>
    </div>
  );
}
