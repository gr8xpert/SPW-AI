import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import { Card17 } from '@/components/listing/cards/CardClassic';
import { provideCard } from '@/components/listing/cards/registry';

// V3 listing template 11. Bundled with this template so its cards render on the first paint.
provideCard(17, Card17);

export default function ListingTemplate17(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-17">
      <RsPropertyGrid {...props} template={17} />
    </div>
  );
}
