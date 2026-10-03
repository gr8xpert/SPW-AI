import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardDefault from '@/components/listing/cards/CardDefault';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(1, CardDefault);

export default function ListingTemplate01(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-01">
      <RsPropertyGrid {...props} template={1} />
    </div>
  );
}
