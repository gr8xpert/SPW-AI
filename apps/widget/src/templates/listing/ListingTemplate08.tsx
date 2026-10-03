import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardCountry from '@/components/listing/cards/CardCountry';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(8, CardCountry);

export default function ListingTemplate08(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-08">
      <RsPropertyGrid {...props} template={8} />
    </div>
  );
}
