import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailVideoLink() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.videoUrl) return null;

  return (
    <a
      class="rs-detail-resource-btn rs-detail-resource-btn--video"
      href={property.videoUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
      {t('detail_video', 'Video')}
    </a>
  );
}
