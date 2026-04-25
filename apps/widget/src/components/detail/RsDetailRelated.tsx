import { useState, useEffect } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
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

  const maxItems = limit ? Number(limit) : 6;

  useEffect(() => {
    if (!property) return;
    let cancelled = false;

    const apiUrl = config.apiUrl.replace(/\/$/, '');
    fetch(`${apiUrl}/api/v1/properties/${encodeURIComponent(property.reference)}/similar?limit=${maxItems}`, {
      headers: { 'X-API-Key': config.apiKey },
    })
      .then((res) => res.json())
      .then((json: { data?: Property[] }) => {
        if (!cancelled && json.data) {
          setRelated(json.data.filter((p) => p.id !== property.id).slice(0, maxItems));
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [property?.reference, config.apiUrl, config.apiKey, maxItems]);

  if (!property || !related.length) return null;

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_similar', 'Similar Properties')}
      </h2>
      <div class="rs-detail-related" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem;">
        {related.map((p) => (
          <a
            key={p.id}
            class="rs-detail-related__card"
            href={`?ref=${p.reference}`}
            style="text-decoration: none; color: inherit; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); background: white;"
          >
            {p.images?.[0] && (
              <img
                src={p.images[0].thumbnailUrl || p.images[0].url}
                alt={p.images[0].alt || p.title}
                style="width: 100%; height: 180px; object-fit: cover; display: block;"
                loading="lazy"
              />
            )}
            <div style="padding: 0.75rem;">
              <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                {p.title}
              </div>
              <div style="color: #2563eb; font-weight: 700; font-size: 0.9rem;">
                {p.priceOnRequest
                  ? t('price_on_request', 'Price on Request')
                  : formatPrice(p.price, p.currency)}
              </div>
              <div style="color: #64748b; font-size: 0.8rem; margin-top: 0.25rem;">
                {p.bedrooms != null && `${p.bedrooms} ${t('beds', 'beds')}`}
                {p.bathrooms != null && ` · ${p.bathrooms} ${t('baths', 'baths')}`}
                {p.buildSize != null && ` · ${p.buildSize}m²`}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
