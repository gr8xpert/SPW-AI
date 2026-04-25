import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate01(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-01">
      <RsPropertyGrid template={1} {...props} />
    </div>
  );
}
