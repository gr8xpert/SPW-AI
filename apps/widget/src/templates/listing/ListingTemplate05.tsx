import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate05(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-05">
      <RsPropertyGrid template={5} {...props} />
    </div>
  );
}
