import { useLabels } from '@/hooks/useLabels';
import { useFavorites } from '@/hooks/useFavorites';
import { useCurrency } from '@/hooks/useCurrency';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { actions } from '@/core/actions';
import { wishlistActions } from '@/hooks/useWishlistState';
import { generateWishlistPDF } from './generate-pdf';
import type { Property } from '@/types';

interface Props {
  [key: string]: unknown;
}

export default function RsWishlistActions(_props: Props) {
  const { t } = useLabels();
  const { favorites, count } = useFavorites();
  const { formatPrice } = useCurrency();
  const results = useSelector(selectors.getResults);

  const hasFavorites = count > 0;

  const properties: Property[] = hasFavorites
    ? (results?.data.filter((p) => favorites.includes(p.id)) ?? [])
    : [];

  const handleClearAll = () => {
    if (confirm(t('wishlist_clear_confirm', 'Remove all properties from your wishlist?'))) {
      actions.setFavorites([]);
      try { localStorage.removeItem('spm_favorites'); } catch { /* */ }
    }
  };

  const config = useSelector(selectors.getConfig);

  const handleDownloadPDF = async () => {
    if (!properties.length) return;
    try {
      await generateWishlistPDF(properties, formatPrice, config.companyName || config.tenantSlug, config.primaryColor);
    } catch (err) {
      console.error('[SPM] PDF generation failed:', err);
    }
  };

  return (
    <div class="rs-wishlist-actions">
      <div class="rs-wishlist-actions__left">
        <button
          type="button"
          class="rs-reset-btn"
          onClick={() => window.history.back()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          {t('back_to_results', 'Back to Results')}
        </button>
        <button
          type="button"
          class="rs-wishlist-actions__clear"
          onClick={handleClearAll}
          disabled={!hasFavorites}
        >
          {t('clear_all', 'Clear All')}
        </button>
      </div>
      <div class="rs-wishlist-actions__right">
        <button
          type="button"
          class="rs-wishlist-actions__pdf"
          onClick={handleDownloadPDF}
          disabled={!hasFavorites}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="9 15 12 18 15 15" />
          </svg>
          {t('download_pdf', 'Download PDF')}
        </button>
        <button
          type="button"
          class="rs-search-btn"
          onClick={() => wishlistActions.openModal('email')}
          disabled={!hasFavorites}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          {t('email', 'Email')}
        </button>
        <button
          type="button"
          class="rs-search-btn"
          onClick={() => wishlistActions.openModal('share')}
          disabled={!hasFavorites}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          {t('share', 'Share')}
        </button>
      </div>
    </div>
  );
}
