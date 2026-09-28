import { useLabels } from '@/hooks/useLabels';
import { useFavorites } from '@/hooks/useFavorites';
import RsWishlistIcon from '@/components/common/RsWishlistIcon';

interface Props {
  // The grid renders this itself once it knows the list is empty. Mounted as a
  // block of its own (an older generated page may still carry one), it has to
  // check for itself — otherwise the message sits under a list of saved
  // properties, telling the visitor they have none.
  force?: boolean;
  [key: string]: unknown;
}

// The block's own container keeps its data-spm-widget attribute after mounting,
// so the grid is visible here even while it is showing nothing.
function hasListOnPage(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('[data-spm-widget="wishlist_grid"], [data-spm-widget="wishlist_list"]');
}

export default function RsWishlistEmpty({ force }: Props) {
  const { t } = useLabels();
  const { count } = useFavorites();

  // Nothing to explain when the visitor has saved something, and nothing to
  // add when the list itself is on the page: it shows this message in place
  // of its cards, so a second copy would only repeat it.
  if (!force && (count > 0 || hasListOnPage())) return null;

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
