import { useSelector } from '@/hooks/useStore';
import { useConfig } from '@/hooks/useConfig';
import { selectors } from '@/core/selectors';
import { getDisplayReference } from '@/core/property-display';

export default function RsDetailRef() {
  const property = useSelector(selectors.getSelectedProperty);
  const config = useConfig();
  if (!property) return null;

  return <span class="rs-detail-ref">{getDisplayReference(property, config)}</span>;
}
