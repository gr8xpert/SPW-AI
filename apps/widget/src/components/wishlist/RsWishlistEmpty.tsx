import { useLabels } from '@/hooks/useLabels';
import RsWishlistIcon from '@/components/common/RsWishlistIcon';

export default function RsWishlistEmpty() {
  const { t } = useLabels();

  return (
    <div class="rs-wishlist-empty">
      <div class="rs-wishlist-empty__icon">
        <RsWishlistIcon size={40} />
      </div>
      <p class="rs-wishlist-empty__title">
        {t('wishlist_empty', 'No saved properties yet')}
      </p>
      <p class="rs-wishlist-empty__text">
        {t('wishlist_empty_hint', 'Browse properties and tap the heart icon to save your favorites here.')}
      </p>
    </div>
  );
}
