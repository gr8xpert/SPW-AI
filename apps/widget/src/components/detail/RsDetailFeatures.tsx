import { useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Feature } from '@/types';

interface Props {
  features?: Feature[];
}

export default function RsDetailFeatures({ features: featuresProp }: Props) {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  const features = featuresProp ?? property?.features;

  const grouped = useMemo(() => {
    if (!features) return new Map<string, Feature[]>();
    const map = new Map<string, Feature[]>();
    for (const f of features) {
      const cat = f.category || 'General';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(f);
    }
    return map;
  }, [features]);

  if (!features?.length) {
    return null;
  }

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_features', 'Features')}
      </h2>
      <div class="rs-detail-features">
        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category} class="rs-detail-features__group">
            <h3 class="rs-detail-features__category">{category}</h3>
            <ul class="rs-detail-features__list">
              {items.map((f) => (
                <li key={f.id} class="rs-detail-features__item">
                  {f.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
