import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailRef() {
  const property = useSelector(selectors.getSelectedProperty);
  if (!property) return null;

  return <span class="rs-detail-ref">{property.reference}</span>;
}
