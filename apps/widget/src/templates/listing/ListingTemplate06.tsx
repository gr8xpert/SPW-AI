import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate06(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-06">
      <RsPropertyGrid template={6} {...props} />
    </div>
  );
}
