import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailBaths() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.bathrooms) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--baths">
      <svg class="rs-detail-spec__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 12h16a1 1 0 011 1v3a4 4 0 01-4 4H7a4 4 0 01-4-4v-3a1 1 0 011-1z" /><path d="M6 12V5a2 2 0 012-2h3v2.25" />
      </svg>
      <span class="rs-detail-spec__value">{property.bathrooms}</span>
      <span class="rs-detail-spec__label">{t('detail_bathrooms', 'Bathrooms')}</span>
    </span>
  );
}
