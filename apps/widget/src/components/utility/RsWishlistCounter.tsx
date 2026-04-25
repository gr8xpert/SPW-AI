import { useFavorites } from '@/hooks/useFavorites';

export default function RsWishlistCounter() {
  const { count } = useFavorites();

  if (count === 0) return null;

  return (
    <span class="rs-wishlist-counter" aria-label={`${count}`}>
      {count}
    </span>
  );
}
