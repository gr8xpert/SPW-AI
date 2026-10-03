import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardImmersive from '@/components/listing/cards/CardImmersive';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(7, CardImmersive);

export default function ListingTemplate07(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-07">
      <RsPropertyGrid {...props} template={7} />
    </div>
  );
}
