import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { useConfig } from '@/hooks/useConfig';
import { selectors } from '@/core/selectors';
import { showBadge } from '@/core/property-display';
import RsDetailStatus from './RsDetailStatus';
import RsDetailType from './RsDetailType';
import RsDetailRef from './RsDetailRef';

/** The badges over the property page photo: listing type, property type,
 *  reference and Key Ready, each one switchable in Settings → Widget. The
 *  standalone detail_status / detail_type / detail_ref blocks ignore that
 *  setting: a site that placed one by hand wants it shown. */
export default function RsDetailGalleryBadges() {
  const { t } = useLabels();
  const config = useConfig();
  const property = useSelector(selectors.getSelectedProperty);
  if (!property) return null;
  return (
    <div class="rs-detail__gallery-badges">
      {showBadge(config, 'listingType') && <RsDetailStatus />}
      {showBadge(config, 'propertyType') && <RsDetailType />}
      {showBadge(config, 'reference') && <RsDetailRef />}
      {property.keyReady && showBadge(config, 'keyReady') && (
        <span class="rs-detail-key-ready">{t('card_key_ready', 'Key Ready')}</span>
      )}
    </div>
  );
}
