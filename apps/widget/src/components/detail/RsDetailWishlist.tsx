import { useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useFavorites } from '@/hooks/useFavorites';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import RsWishlistIcon from '@/components/common/RsWishlistIcon';

interface Props {
  propertyId?: number;
}

export default function RsDetailWishlist({ propertyId: idProp }: Props) {
  const { t } = useLabels();
  const { isFavorite, toggle } = useFavorites();
  const property = useSelector(selectors.getSelectedProperty);
  const propertyId = idProp ?? property?.id;
  const [bouncing, setBouncing] = useState(false);

  if (propertyId == null) return null;

  const saved = isFavorite(propertyId);

  const handleToggle = useCallback(() => {
    toggle(propertyId);
    setBouncing(true);
    setTimeout(() => setBouncing(false), 300);
  }, [propertyId, toggle]);

  return (
    <button
      class={`rs-detail-wishlist${saved ? ' rs-detail-wishlist--saved' : ''}${bouncing ? ' rs-heart-bounce' : ''}`}
      onClick={handleToggle}
      type="button"
    >
      <span class="rs-detail-wishlist__icon"><RsWishlistIcon size={18} filled={saved} /></span>
      <span class="rs-detail-wishlist__label">
        {saved
          ? t('detail_saved', 'Saved')
          : t('detail_save', 'Save')}
      </span>
    </button>
  );
}
