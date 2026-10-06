import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import { Card15 } from '@/components/listing/cards/CardClassic';
import { provideCard } from '@/components/listing/cards/registry';

// V3 listing template 09. Bundled with this template so its cards render on the first paint.
provideCard(15, Card15);

export default function ListingTemplate15(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-15">
      <RsPropertyGrid {...props} template={15} />
    </div>
  );
}
