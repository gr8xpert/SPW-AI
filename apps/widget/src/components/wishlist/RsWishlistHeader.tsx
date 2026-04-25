import { useLabels } from '@/hooks/useLabels';
import { useFavorites } from '@/hooks/useFavorites';

export default function RsWishlistHeader() {
  const { t } = useLabels();
  const { count } = useFavorites();

  return (
    <div class="rs-wishlist-header">
      <h2 class="rs-wishlist-header__title">
        {t('wishlist_title', 'My Wishlist')}
      </h2>
      <span class="rs-wishlist-header__count">({count})</span>
    </div>
  );
}
