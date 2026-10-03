import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardCompact from '@/components/listing/cards/CardCompact';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(4, CardCompact);

export default function ListingTemplate04(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-04">
      <RsPropertyGrid {...props} template={4} />
    </div>
  );
}
