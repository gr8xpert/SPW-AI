import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate04(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-04">
      <RsPropertyGrid template={4} {...props} />
    </div>
  );
}
