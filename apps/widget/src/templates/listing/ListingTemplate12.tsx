import RsPropertyGrid from '@/components/listing/RsPropertyGrid';

export default function ListingTemplate12(props: Record<string, unknown>) {
  return (
    <div class="rs-listing-template-12">
      <RsPropertyGrid template={12} {...props} />
    </div>
  );
}
