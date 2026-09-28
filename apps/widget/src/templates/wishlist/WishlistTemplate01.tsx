import RsWishlistHeader from '@/components/wishlist/RsWishlistHeader';
import RsWishlistActions from '@/components/wishlist/RsWishlistActions';
import RsWishlistGrid from '@/components/wishlist/RsWishlistGrid';
import RsWishlistModals from '@/components/wishlist/RsWishlistModals';

/**
 * The saved-properties page in one block, so `site-wishlist` is a single line
 * like every other page type. The grid shows the "nothing saved yet" message
 * itself when the list is empty, so there is no separate empty block here.
 */
export default function WishlistTemplate01() {
  return (
    <div class="rs-wishlist-template-01">
      <RsWishlistHeader />
      <RsWishlistActions />
      <RsWishlistGrid />
      <RsWishlistModals />
    </div>
  );
}
