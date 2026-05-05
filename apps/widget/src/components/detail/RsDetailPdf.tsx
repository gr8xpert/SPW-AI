import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

export default function RsDetailPdf() {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property?.pdfUrl) return null;

  return (
    <a
      class="rs-detail-resource-btn rs-detail-resource-btn--pdf"
      href={property.pdfUrl}
      target="_blank"
      rel="noopener noreferrer"
      download
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><polyline points="9 15 12 18 15 15" />
      </svg>
      {t('detail_pdf', 'Download PDF')}
    </a>
  );
}
