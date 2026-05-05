import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailBeds() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.bedrooms) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--beds">
      <svg class="rs-detail-spec__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M2 4v16" /><path d="M2 8h18a2 2 0 012 2v10" /><path d="M2 17h20" /><path d="M6 8v9" />
      </svg>
      <span class="rs-detail-spec__value">{property.bedrooms}</span>
      <span class="rs-detail-spec__label">{t('detail_bedrooms', 'Bedrooms')}</span>
    </span>
  );
}
