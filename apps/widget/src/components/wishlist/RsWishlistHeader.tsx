import { useLabels } from '@/hooks/useLabels';
import { useFavorites } from '@/hooks/useFavorites';
import RsWishlistIcon from '@/components/common/RsWishlistIcon';

export default function RsWishlistHeader() {
  const { t } = useLabels();
  const { count } = useFavorites();

  return (
    <div class="rs-wishlist-header">
      <RsWishlistIcon size={22} class="rs-wishlist-header__icon" />
      <h2 class="rs-wishlist-header__title">
        {t('wishlist_title', 'My Wishlist')}
      </h2>
      <span class="rs-wishlist-header__count">
        {count} {count === 1
          ? t('property_singular', 'property')
          : t('properties', 'properties')}
      </span>
    </div>
  );
}
