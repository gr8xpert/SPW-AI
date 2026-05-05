import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsDetailVideoLink from './RsDetailVideoLink';
import RsDetailTourLink from './RsDetailTourLink';
import RsDetailPdf from './RsDetailPdf';

export default function RsDetailResources() {
  const property = useSelector(selectors.getSelectedProperty);
  if (!property) return null;

  const hasAny = property.videoUrl || property.virtualTourUrl || property.pdfUrl;
  if (!hasAny) return null;

  return (
    <div class="rs-detail-resources">
      <RsDetailVideoLink />
      <RsDetailTourLink />
      <RsDetailPdf />
    </div>
  );
}
