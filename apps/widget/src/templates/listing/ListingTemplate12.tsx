import RsPropertyGrid from '@/components/listing/RsPropertyGrid';
import CardLocationFirst from '@/components/listing/cards/CardLocationFirst';
import { provideCard } from '@/components/listing/cards/registry';

// Bundled with this template so its cards render on the first paint.
provideCard(12, CardLocationFirst);

export default function ListingTemplate12(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-12">
      <RsPropertyGrid {...props} template={12} />
    </div>
  );
}
