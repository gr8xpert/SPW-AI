// Shown on the property page when its listing no longer exists: a sold or
// withdrawn property reached through an old link (a campaign, a saved search
// email). The words are labels, so the client sets them per language on the
// dashboard's Labels page.
import { useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { navigateTo } from '@/core/navigate';

export default function RsDetailNotFound() {
  const { t } = useLabels();
  const config = useConfig();
  const href = config.resultsPage || '/';

  // A plain link for crawlers and new tabs; a single-page app routes it itself.
  const handleClick = useCallback((e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigateTo(href);
  }, [href]);

  return (
    <div class="rs-detail-not-found" role="status">
      <h2 class="rs-detail-not-found__title">
        {t('detail_not_found_title', 'This property has been sold or removed')}
      </h2>
      <p class="rs-detail-not-found__text">
        {t('detail_not_found_text', 'Please take a look at our other properties.')}
      </p>
      <a class="rs-detail-not-found__button" href={href} onClick={handleClick}>
        {t('detail_not_found_button', 'Search properties')}
      </a>
    </div>
  );
}
