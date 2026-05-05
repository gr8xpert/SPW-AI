import { useFavorites } from '@/hooks/useFavorites';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import RsWishlistIcon from '@/components/common/RsWishlistIcon';

export default function RsWishlistCounter() {
  const { count } = useFavorites();
  const { t } = useLabels();
  const config = useConfig();

  const href = config.wishlistPage || '#';

  return (
    <a
      class="rs-wishlist-counter"
      href={href}
      aria-label={t('wishlist', 'Wishlist')}
      title={t('wishlist', 'Wishlist')}
    >
      <RsWishlistIcon size={20} />
      {count > 0 && <span class="rs-wishlist-counter__badge">{count}</span>}
    </a>
  );
}
