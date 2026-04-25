import { useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useFavorites } from '@/hooks/useFavorites';
import { useCurrency } from '@/hooks/useCurrency';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import { useWishlistState, wishlistActions } from '@/hooks/useWishlistState';
import type { Property } from '@/types';

interface Props {
  showCompare?: boolean;
  showShare?: boolean;
  onClose?: () => void;
  [key: string]: unknown;
}

export default function RsWishlistModals(_props: Props) {
  const { activeModal } = useWishlistState();

  if (!activeModal) return null;

  return (
    <div class="rs-modal-backdrop rs-backdrop-enter" onClick={() => wishlistActions.closeModal()}>
      <div class="rs-modal-content rs-modal-enter" onClick={(e: Event) => e.stopPropagation()}>
        {activeModal === 'share' && <ShareModal />}
        {activeModal === 'email' && <EmailModal />}
        {activeModal === 'compare' && <CompareModal />}
      </div>
    </div>
  );
}

function ShareModal() {
  const { t } = useLabels();
  const { favorites } = useFavorites();
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}${window.location.pathname}?shared=${btoa(JSON.stringify(favorites))}`;
  const encodedUrl = encodeURIComponent(shareUrl);
  const shareText = encodeURIComponent(t('wishlist_share_text', 'Check out my property wishlist!'));

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* */ }
  }, [shareUrl]);

  return (
    <>
      <div class="rs-modal-header">
        <span class="rs-modal-header__title">{t('share_wishlist', 'Share Your Wishlist')}</span>
        <button type="button" class="rs-modal-header__close" onClick={() => wishlistActions.closeModal()} aria-label={t('close', 'Close')}>&times;</button>
      </div>
      <div class="rs-modal-body">
        <p class="rs-wishlist-share__desc">{t('share_wishlist_desc', 'Share this link with anyone to show them your saved properties:')}</p>
        <div class="rs-wishlist-share__link-row">
          <input type="text" class="rs-input rs-wishlist-share__url" value={shareUrl} readOnly />
          <button type="button" class="rs-search-btn" onClick={copyLink}>
            {copied ? t('copied', 'Copied!') : t('copy', 'Copy')}
          </button>
        </div>
        <div class="rs-wishlist-share__channels">
          <a
            class="rs-wishlist-share__channel"
            href={`https://wa.me/?text=${shareText}%20${encodedUrl}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            <span>WhatsApp</span>
          </a>
          <a
            class="rs-wishlist-share__channel"
            href={`mailto:?subject=${shareText}&body=${encodedUrl}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <span>{t('email', 'Email')}</span>
          </a>
          <button
            type="button"
            class="rs-wishlist-share__channel"
            onClick={() => generateQR(shareUrl)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><rect x="14" y="18" width="3" height="3"/><rect x="18" y="14" width="3" height="3"/></svg>
            <span>{t('qr_code', 'QR Code')}</span>
          </button>
        </div>
      </div>
    </>
  );
}

function generateQR(url: string): void {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
  window.open(qrUrl, '_blank', 'width=300,height=300');
}

function EmailModal() {
  const { t } = useLabels();
  const { favorites } = useFavorites();
  const config = useConfig();
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleSubmit = useCallback(async (e: Event) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const apiUrl = config.apiUrl.replace(/\/$/, '');
      const res = await fetch(`${apiUrl}/api/v1/share-favorites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey,
        },
        body: JSON.stringify({
          type: 'email',
          recipientEmail: to,
          senderEmail: from || undefined,
          message: message || undefined,
          propertyIds: favorites,
        }),
      });
      if (res.ok) {
        setStatus('sent');
        setTimeout(() => wishlistActions.closeModal(), 1500);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  }, [to, from, message, favorites, config]);

  return (
    <>
      <div class="rs-modal-header">
        <span class="rs-modal-header__title">{t('email_wishlist', 'Email Your Wishlist')}</span>
        <button type="button" class="rs-modal-header__close" onClick={() => wishlistActions.closeModal()} aria-label={t('close', 'Close')}>&times;</button>
      </div>
      <div class="rs-modal-body">
        {status === 'sent' ? (
          <p class="rs-wishlist-email__success">{t('email_sent', 'Email sent successfully!')}</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div class="rs-field">
              <label class="rs-field__label">{t('send_to', 'Send to:')}</label>
              <input
                class="rs-input"
                type="email"
                value={to}
                onInput={(e) => setTo((e.target as HTMLInputElement).value)}
                placeholder="recipient@example.com"
                required
              />
            </div>
            <div class="rs-field">
              <label class="rs-field__label">{t('your_email_optional', 'Your email (optional):')}</label>
              <input
                class="rs-input"
                type="email"
                value={from}
                onInput={(e) => setFrom((e.target as HTMLInputElement).value)}
                placeholder="your@example.com"
              />
            </div>
            <div class="rs-field">
              <label class="rs-field__label">{t('personal_message', 'Personal message (optional):')}</label>
              <textarea
                class="rs-input"
                value={message}
                onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
                rows={4}
                placeholder={t('add_personal_note', 'Add a personal note...')}
              />
            </div>
            {status === 'error' && (
              <p class="rs-wishlist-email__error">{t('email_error', 'Failed to send. Please try again.')}</p>
            )}
            <div class="rs-modal-footer">
              <button type="button" class="rs-reset-btn" onClick={() => wishlistActions.closeModal()}>
                {t('cancel', 'Cancel')}
              </button>
              <button type="submit" class="rs-search-btn" disabled={status === 'sending'}>
                {status === 'sending' ? t('sending', 'Sending...') : t('send_email', 'Send Email')}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function CompareModal() {
  const { t } = useLabels();
  const { formatPrice } = useCurrency();
  const { compareSelection } = useWishlistState();
  const results = useSelector(selectors.getResults);

  const properties: Property[] = results?.data.filter((p) =>
    compareSelection.includes(p.id)
  ) ?? [];

  if (properties.length < 2) {
    return (
      <>
        <div class="rs-modal-header">
          <span class="rs-modal-header__title">{t('compare_properties', 'Compare Properties')}</span>
          <button type="button" class="rs-modal-header__close" onClick={() => wishlistActions.closeModal()} aria-label={t('close', 'Close')}>&times;</button>
        </div>
        <div class="rs-modal-body">
          <p>{t('compare_select_min', 'Please select at least 2 properties to compare.')}</p>
        </div>
      </>
    );
  }

  const rows: { label: string; getValue: (p: Property) => string }[] = [
    { label: t('price', 'Price'), getValue: (p) => p.priceOnRequest ? t('price_on_request', 'P.O.R.') : formatPrice(p.price, p.currency) },
    { label: t('location', 'Location'), getValue: (p) => p.location.name },
    { label: t('type', 'Type'), getValue: (p) => p.propertyType?.name ?? '-' },
    { label: t('bedrooms', 'Bedrooms'), getValue: (p) => p.bedrooms != null ? String(p.bedrooms) : '-' },
    { label: t('bathrooms', 'Bathrooms'), getValue: (p) => p.bathrooms != null ? String(p.bathrooms) : '-' },
    { label: t('card_build_size', 'Build Size'), getValue: (p) => p.buildSize != null ? `${p.buildSize} m²` : '-' },
    { label: t('card_plot_size', 'Plot Size'), getValue: (p) => p.plotSize != null ? `${p.plotSize} m²` : '-' },
    { label: t('detail_year_built', 'Year Built'), getValue: (p) => p.year != null ? String(p.year) : '-' },
    { label: t('detail_energy_rating', 'Energy Rating'), getValue: (p) => p.energyRating ?? '-' },
  ];

  return (
    <>
      <div class="rs-modal-header">
        <span class="rs-modal-header__title">{t('compare_properties', 'Compare Properties')}</span>
        <button type="button" class="rs-modal-header__close" onClick={() => wishlistActions.closeModal()} aria-label={t('close', 'Close')}>&times;</button>
      </div>
      <div class="rs-modal-body rs-modal-body--wide">
        <div class="rs-compare-table-wrap">
          <table class="rs-compare-table">
            <thead>
              <tr>
                <th class="rs-compare-table__feature">{t('feature', 'Feature')}</th>
                {properties.map((p) => (
                  <th key={p.id} class="rs-compare-table__prop">
                    {p.images[0] && (
                      <img
                        src={p.images[0].thumbnailUrl ?? p.images[0].url}
                        alt={p.title}
                        class="rs-compare-table__img"
                      />
                    )}
                    <div class="rs-compare-table__prop-title">{p.title}</div>
                    <div class="rs-compare-table__prop-price">
                      {p.priceOnRequest ? t('price_on_request', 'P.O.R.') : formatPrice(p.price, p.currency)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td class="rs-compare-table__feature">{row.label}</td>
                  {properties.map((p) => (
                    <td key={p.id}>{row.getValue(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div class="rs-modal-footer">
        <button type="button" class="rs-reset-btn" onClick={() => wishlistActions.closeModal()}>
          {t('close', 'Close')}
        </button>
      </div>
    </>
  );
}
