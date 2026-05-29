import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

/**
 * Triggers a server-rendered property brochure download. Variant (branded vs
 * unbranded) is resolved server-side from tenant + per-property settings —
 * widget does not pass a variant override.
 */
export default function RsDetailDownloadPdf() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  const config = useSelector(selectors.getConfig);
  if (!property?.reference || !config.apiUrl || !config.apiKey) return null;

  const handleDownload = () => {
    const base = config.apiUrl.replace(/\/$/, '');
    const lang = config.language || 'en';
    const url = `${base}/api/v1/properties/${encodeURIComponent(property.reference)}/brochure.pdf?lang=${encodeURIComponent(lang)}&apiKey=${encodeURIComponent(config.apiKey)}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <button
      class="rs-detail-download-pdf"
      type="button"
      onClick={handleDownload}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <polyline points="9 15 12 18 15 15" />
      </svg>
      {t('detail_download_pdf', 'Download PDF')}
    </button>
  );
}
