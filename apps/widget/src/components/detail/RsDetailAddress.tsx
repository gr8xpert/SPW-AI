import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Property } from '@/types';

// The API sends the stored columns (street, streetNumber, postcode); address
// and zipCode are older names kept for hand-made data.
type WithStreet = Property & { street?: string | null; streetNumber?: string | null; postcode?: string | null };

export default function RsDetailAddress() {
  const property = useSelector(selectors.getSelectedProperty) as WithStreet | null;
  if (!property) return null;
  const street = property.address || [property.street, property.streetNumber].filter(Boolean).join(' ');
  const zip = property.zipCode || property.postcode;
  if (!street) return null;

  return (
    <span class="rs-detail-address">
      {street}
      {zip && `, ${zip}`}
    </span>
  );
}
