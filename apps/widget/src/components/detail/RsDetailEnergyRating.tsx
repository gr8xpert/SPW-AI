import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

const RATING_COLORS: Record<string, string> = {
  A: '#00a651', B: '#50b848', C: '#bfd730', D: '#fff200',
  E: '#fdb913', F: '#f37021', G: '#ed1c24',
};

export default function RsDetailEnergyRating() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.energyRating) return null;

  const color = RATING_COLORS[property.energyRating.toUpperCase()] || '#94a3b8';

  return (
    <span class="rs-detail-spec rs-detail-spec--energy">
      <span class="rs-detail-energy-badge" style={`background:${color};color:#fff`}>
        {property.energyRating}
      </span>
      <span class="rs-detail-spec__label">{t('detail_energy_rating', 'Energy Rating')}</span>
    </span>
  );
}
