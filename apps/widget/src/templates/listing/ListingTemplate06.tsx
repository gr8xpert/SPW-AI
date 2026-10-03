import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardElegant from '@/components/listing/cards/CardElegant';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(6, CardElegant);

export default function ListingTemplate06(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-06">
      <RsPropertyGrid {...props} template={6} />
    </div>
  );
}
