import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardRustic from '@/components/listing/cards/CardRustic';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(9, CardRustic);

export default function ListingTemplate09(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-09">
      <RsPropertyGrid {...props} template={9} />
    </div>
  );
}
