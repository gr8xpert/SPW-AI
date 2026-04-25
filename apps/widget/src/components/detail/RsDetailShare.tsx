import { useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Property } from '@/types';

interface Props {
  property?: Property;
}

export default function RsDetailShare({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;
  const [copied, setCopied] = useState(false);

  if (!property) return null;

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const subject = encodeURIComponent(property.title);
  const body = encodeURIComponent(`${property.title}\n${url}`);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing if clipboard API is not available
    }
  }, [url]);

  return (
    <div class="rs-detail-share">
      <button
        class="rs-detail-share__btn"
        onClick={copyLink}
        type="button"
        title={t('detail_share', 'Share')}
      >
        {copied ? '✓' : '📎'}
      </button>

      <a
        class="rs-detail-share__btn"
        href={`mailto:?subject=${subject}&body=${body}`}
        title="Email"
      >
        ✉
      </a>

      <a
        class="rs-detail-share__btn"
        href={`https://wa.me/?text=${body}`}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
      >
        WhatsApp
      </a>
    </div>
  );
}
