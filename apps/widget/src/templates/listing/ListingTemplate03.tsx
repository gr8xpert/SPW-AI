import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate03(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-03">
      <RsPropertyGrid template={3} {...props} />
    </div>
  );
}
