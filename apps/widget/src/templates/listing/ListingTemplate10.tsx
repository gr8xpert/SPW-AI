import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardMetro from '@/components/listing/cards/CardMetro';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(10, CardMetro);

export default function ListingTemplate10(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-10">
      <RsPropertyGrid {...props} template={10} />
    </div>
  );
}
