import RsLocation from '@/components/search/RsLocation';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsAiSearch from '@/components/search/RsAiSearch';
import RsAiActions from '@/components/search/RsAiActions';

export default function SearchTemplate06() {
  return (
    <div class="rs-search-template-06">
      <RsAiSearch badge={false} />
      <div class="rs-search-minimal">
        <RsLocation variation={1} />
        <RsPropertyType variation={2} />
        <RsSearchButton />
        <RsAiActions />
      </div>
    </div>
  );
}
