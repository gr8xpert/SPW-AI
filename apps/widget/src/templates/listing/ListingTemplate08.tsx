import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate08(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-08">
      <RsPropertyGrid template={8} {...props} />
    </div>
  );
}
