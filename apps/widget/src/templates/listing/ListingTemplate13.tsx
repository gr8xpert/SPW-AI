import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import { Card13 } from '@/components/listing/cards/CardClassic';
import { provideCard } from '@/components/listing/cards/registry';

// V3 listing template 07. Bundled with this template so its cards render on the first paint.
provideCard(13, Card13);

export default function ListingTemplate13(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-13">
      <RsPropertyGrid {...props} template={13} />
    </div>
  );
}
