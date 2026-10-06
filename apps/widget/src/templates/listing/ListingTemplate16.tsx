import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import { Card16 } from '@/components/listing/cards/CardClassic';
import { provideCard } from '@/components/listing/cards/registry';

// V3 listing template 10. Bundled with this template so its cards render on the first paint.
provideCard(16, Card16);

export default function ListingTemplate16(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-16">
      <RsPropertyGrid {...props} template={16} />
    </div>
  );
}
