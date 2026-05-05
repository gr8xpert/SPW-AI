import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailLocation() {
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.location) return null;

  return (
    <span class="rs-detail-location">
      <svg class="rs-detail-location__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      {property.location.name}
    </span>
  );
}
