import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailAddress() {
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.address) return null;

  return (
    <span class="rs-detail-address">
      {property.address}
      {property.zipCode && `, ${property.zipCode}`}
    </span>
  );
}
