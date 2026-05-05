import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailTourEmbed() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.virtualTourUrl) return null;

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_virtual_tour', 'Virtual Tour')}
      </h2>
      <div class="rs-detail-video">
        <iframe
          class="rs-detail-video__iframe"
          src={property.virtualTourUrl}
          allow="accelerometer; gyroscope; fullscreen; vr; xr"
          allowFullScreen
          loading="lazy"
          title="Virtual tour"
        />
      </div>
    </div>
  );
}
