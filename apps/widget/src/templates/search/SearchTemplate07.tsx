import RsLocation from '@/components/search/RsLocation';
import RsListingType from '@/components/search/RsListingType';
import RsPropertyType from '@/components/search/RsPropertyType';
import RsBedrooms from '@/components/search/RsBedrooms';
import RsPrice from '@/components/search/RsPrice';
import RsReference from '@/components/search/RsReference';
import RsQuickFeatures from '@/components/search/RsQuickFeatures';
import RsSearchButton from '@/components/search/RsSearchButton';
import RsResetButton from '@/components/search/RsResetButton';
import RsAiSearch from '@/components/search/RsAiSearch';
import RsAiActions from '@/components/search/RsAiActions';
import RsSort from '@/components/listing/RsSort';
import RsCurrencySelector from '@/components/utility/RsCurrencySelector';

interface Props {
  // Features offered as "Refine" buttons: data-spm-feature-ids="12,45" or
  // [spm_search template="7" feature-ids="12,45"]. Without it, the site's
  // quick features (quickFeatureIds).
  'feature-ids'?: string;
  [key: string]: unknown;
}

/**
 * Three rows under the listing-type tabs (like design 03):
 *   Reference · 1–3 location dropdowns · Property type
 *   Min price · Max price · Bedrooms · Reset · Search (count)
 *   Refine feature buttons · Sort · Currency
 */
export default function SearchTemplate07(props: Props) {
  return (
    <div class="rs-search-template-07">
      <RsAiSearch badge={false} />
      <RsListingType variation={1} />
      <div class="rs-search-row rs-search-row--inline rs-t07-row rs-t07-row--where">
        <RsReference />
        <RsLocation variation={2} />
        <RsPropertyType variation={2} />
      </div>
      <div class="rs-search-row rs-search-row--inline rs-t07-row rs-t07-row--what">
        <RsPrice variation={1} />
        <RsBedrooms variation={1} />
        <RsResetButton variation={1} />
        <RsSearchButton />
        <RsAiActions />
      </div>
      <div class="rs-t07-refine">
        <RsQuickFeatures variation={2} feature-ids={props['feature-ids']} />
        <div class="rs-t07-tools">
          <RsSort />
          <RsCurrencySelector />
        </div>
      </div>
    </div>
  );
}
