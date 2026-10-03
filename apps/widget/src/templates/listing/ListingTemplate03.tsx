import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardBlend from '@/components/listing/cards/CardBlend';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(3, CardBlend);

export default function ListingTemplate03(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-03">
      <RsPropertyGrid {...props} template={3} />
    </div>
  );
}
