import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardDefault from '@/components/listing/cards/CardDefault';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(11, CardDefault);

export default function ListingTemplate11(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-11">
      <RsPropertyGrid {...props} template={11} />
    </div>
  );
}
