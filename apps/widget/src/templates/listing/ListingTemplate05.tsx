import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardShowcase from '@/components/listing/cards/CardShowcase';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(5, CardShowcase);

export default function ListingTemplate05(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-05">
      <RsPropertyGrid {...props} template={5} />
    </div>
  );
}
