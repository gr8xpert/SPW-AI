import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardOverlay from '@/components/listing/cards/CardOverlay';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(2, CardOverlay);

export default function ListingTemplate02(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-02">
      <RsPropertyGrid {...props} template={2} />
    </div>
  );
}
