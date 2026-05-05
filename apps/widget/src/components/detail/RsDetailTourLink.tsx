import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailTourLink() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.virtualTourUrl) return null;

  return (
    <a
      class="rs-detail-resource-btn rs-detail-resource-btn--tour"
      href={property.virtualTourUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 000 20 14.5 14.5 0 000-20" /><path d="M2 12h20" />
      </svg>
      {t('detail_virtual_tour', 'Virtual Tour')}
    </a>
  );
}
