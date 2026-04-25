import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate10(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-10">
      <RsPropertyGrid template={10} {...props} />
    </div>
  );
}
