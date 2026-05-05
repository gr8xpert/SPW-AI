import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailPlot() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.plotSize) return null;

  return (
    <span class="rs-detail-spec rs-detail-spec--plot">
      <svg class="rs-detail-spec__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6l9-4 9 4v12l-9 4-9-4V6z" /><path d="M12 2v20" />
      </svg>
      <span class="rs-detail-spec__value">{property.plotSize} m²</span>
      <span class="rs-detail-spec__label">{t('detail_plot_size', 'Plot Size')}</span>
    </span>
  );
}
