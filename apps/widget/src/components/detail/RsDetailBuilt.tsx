import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { specRange } from '@/core/property-display';

export default function RsDetailBuilt() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  // "0.00" from the API is no size: nothing to show.
  const value = property ? specRange(property, 'buildSize') : null;
  if (!property || !value) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--built">
      <svg class="rs-detail-spec__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" />
      </svg>
      <span class="rs-detail-spec__value">{value} m²</span>
      <span class="rs-detail-spec__label">{t('detail_built_area', 'Built Area')}</span>
    </span>
  );
}
