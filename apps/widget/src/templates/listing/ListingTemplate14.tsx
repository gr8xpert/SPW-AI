import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import { Card14 } from '@/components/listing/cards/CardClassic';
import { provideCard } from '@/components/listing/cards/registry';

// V3 listing template 08. Bundled with this template so its cards render on the first paint.
provideCard(14, Card14);

export default function ListingTemplate14(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-14">
      <RsPropertyGrid {...props} template={14} />
    </div>
  );
}
