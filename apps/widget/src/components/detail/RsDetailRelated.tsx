import { useState, useEffect } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { getDataLoader } from '@/core/data-loader';
import type { Property } from '@/types';

interface Props {
  limit?: number;
}

export default function RsDetailRelated({ limit }: Props) {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const config = useConfig();
  const property = useSelector(selectors.getSelectedProperty);
  const [related, setRelated] = useState<Property[]>([]);

  const maxItems = limit ? Number(limit) : (config.similarPropertiesLimit ?? 4);

  useEffect(() => {
    if (!property || maxItems <= 0) return;
    const loader = getDataLoader();
    if (!loader) return;
    let cancelled = false;

    loader.getSimilarProperties(property.reference, maxItems)
      .then((list) => {
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setRelated(arr.filter((p) => p.id !== property.id).slice(0, maxItems));
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [property?.reference, maxItems]);

  if (!property || !related.length) return null;

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_similar', 'Similar Properties')}
      </h2>
      <div class="rs-detail-related__grid">
        {related.map((p, i) => (
          <a
            key={p.id}
            class="rs-detail-related__card"
            href={`?ref=${p.reference}`}
            style={`--i:${i}`}
          >
            <div class="rs-detail-related__image">
              {p.images?.[0] && (
                <img
                  src={p.images[0].thumbnailUrl || p.images[0].url}
                  alt={p.images[0].alt || p.title}
                  loading="lazy"
                />
              )}
            </div>
            <div class="rs-detail-related__body">
              <div class="rs-detail-related__title">
                {p.title}
              </div>
              {p.location?.name && (
                <div class="rs-detail-related__location">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {p.location.name}
                </div>
              )}
              <div class="rs-detail-related__specs">
                {p.bedrooms != null && <span>{p.bedrooms} {t('beds', 'beds')}</span>}
                {p.bathrooms != null && <span>{p.bathrooms} {t('baths', 'baths')}</span>}
                {p.buildSize != null && <span>{p.buildSize}m²</span>}
              </div>
              <div class="rs-detail-related__price">
                {p.priceOnRequest
                  ? t('price_on_request', 'Price on Request')
                  : formatPrice(p.price, p.currency)}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
