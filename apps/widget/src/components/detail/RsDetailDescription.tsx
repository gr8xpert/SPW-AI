import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

interface Props {
  description?: string;
}

export default function RsDetailDescription({ description: descProp }: Props) {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  const description = descProp ?? property?.description;

  if (!description) {
    return null;
  }

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_description', 'Description')}
      </h2>
      <div
        class="rs-detail-description"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    </div>
  );
}
