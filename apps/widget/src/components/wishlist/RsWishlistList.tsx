import { useFavorites } from '@/hooks/useFavorites';
import RsWishlistHeader from './RsWishlistHeader';
import RsWishlistGrid from './RsWishlistGrid';
import RsWishlistActions from './RsWishlistActions';
import RsWishlistSort from './RsWishlistSort';
import RsWishlistCompareBtn from './RsWishlistCompareBtn';
import RsWishlistModals from './RsWishlistModals';

export default function RsWishlistList() {
  const { count } = useFavorites();

  return (
    <div class="rs-wishlist">
      <RsWishlistHeader />
      <div class="rs-wishlist__toolbar">
        <RsWishlistActions />
        <div class="rs-wishlist__toolbar-right">
          {count >= 15 && <RsWishlistSort />}
          <RsWishlistCompareBtn />
        </div>
      </div>
      <RsWishlistGrid />
      <RsWishlistModals />
    </div>
  );
}
