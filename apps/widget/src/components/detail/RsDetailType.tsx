import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailType() {
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.propertyType) return null;

  return <span class="rs-detail-type">{property.propertyType.name}</span>;
}
