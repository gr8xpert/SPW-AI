import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate02(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-02">
      <RsPropertyGrid template={2} {...props} />
    </div>
  );
}
