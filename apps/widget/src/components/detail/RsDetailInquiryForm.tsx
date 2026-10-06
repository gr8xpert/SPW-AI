import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Property } from '@/types';
import { countryCodes, guessCountry, isCountry } from './country-codes';
import { trackingSession } from '@/core/tracker';
import { useRecaptcha } from '@/hooks/useRecaptcha';

// The visitor's country from the API (Cloudflare knows it from their IP),
// asked once per browser session. Undefined until known.
let visitorCountry: Promise<string | null> | null = null;
function askVisitorCountry(apiUrl: string): Promise<string | null> {
  try {
    const saved = sessionStorage.getItem('spm_country');
    if (saved) return Promise.resolve(isCountry(saved) ? saved : null);
  } catch { /* storage blocked */ }
  visitorCountry ??= fetch(`${apiUrl.replace(/\/$/, '')}/api/v1/visitor-country`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const c = (j?.data?.country ?? j?.country ?? '').toUpperCase();
      try { sessionStorage.setItem('spm_country', c || '-'); } catch { /* storage blocked */ }
      return isCountry(c) ? c : null;
    })
    .catch(() => null);
  return visitorCountry;
}

interface Props {
  property?: Property;
}

function buildDefaultMessage(property: Property, t: (k: string, fb: string) => string): string {
  const typeName = property.propertyType?.name || '';
  const locationName = property.location?.name || '';
  const listingLabel = property.listingType === 'rent' ? t('inquiry_for_rent', 'for rent')
    : property.listingType === 'holiday_rent' ? t('inquiry_for_holiday_rent', 'for holiday rent')
    : t('inquiry_for_sale', 'for sale');

  const desc = [typeName, listingLabel, locationName ? `in ${locationName}` : ''].filter(Boolean).join(' ');
  const title = property.title || desc;

  const template = t(
    'inquiry_default_message',
    'I am interested in the property "{title}" (Ref: {ref}). Please contact me with more information.',
  );

  return template
    .replace('{title}', title)
    .replace('{ref}', property.reference || '');
}

export default function RsDetailInquiryForm({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const countries = countryCodes(config.language || 'en');
  const [country, setCountry] = useState(() => guessCountry() || 'ES');
  const countryPicked = useRef(false);
  useEffect(() => {
    let live = true;
    void askVisitorCountry(config.apiUrl).then((c) => {
      if (live && c && !countryPicked.current) setCountry(c);
    });
    return () => { live = false; };
  }, [config.apiUrl]);
  const selected = countries.find((c) => c.country === country) || countries.find((c) => c.country === 'ES') || countries[0];
  const countryCode = selected.code;
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const captcha = useRecaptcha();
  const siteKey = captcha.siteKey;
  const recaptchaToken = captcha.token;

  useEffect(() => {
    if (property && !message) {
      setMessage(buildDefaultMessage(property, t));
    }
  }, [property]);

  const handleSubmit = useCallback(
    async (e: Event) => {
      e.preventDefault();
      if (!property) return;
      if (siteKey && !recaptchaToken) return;
      setStatus('sending');

      try {
        const apiUrl = config.apiUrl.replace(/\/$/, '');
        const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
        const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : undefined;

        const body: Record<string, unknown> = {
          propertyId: property.id,
          propertyReference: property.reference,
          name: fullName,
          email,
          phone: fullPhone,
          message,
          // The agency's email links to the page it was sent from.
          pageUrl: window.location.href.slice(0, 1000),
          // Ties the inquiry to this visit's property view in Analytics.
          sessionId: trackingSession(),
        };
        if (siteKey && recaptchaToken) {
          body.recaptchaToken = recaptchaToken;
        }

        const res = await fetch(`${apiUrl}/api/v1/inquiry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': config.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error('Failed to send inquiry');

        setStatus('success');
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setMessage('');
        setPrivacyAccepted(false);
        captcha.reset();
      } catch {
        setStatus('error');
      }
    },
    [config.apiUrl, config.apiKey, property, firstName, lastName, email, countryCode, phone, message, siteKey, recaptchaToken],
  );

  if (!property) return null;


  return (
    <div class="rs-detail-inquiry">
      <h3 class="rs-detail-inquiry__heading">
        {t('inquiry_title', 'Contact Agent')}
      </h3>

      {status === 'success' && (
        <div class="rs-detail-inquiry__message rs-detail-inquiry__message--success">
          {t('inquiry_success', 'Your inquiry has been sent successfully.')}
        </div>
      )}

      {status === 'error' && (
        <div class="rs-detail-inquiry__message rs-detail-inquiry__message--error">
          {t('inquiry_error', 'Failed to send inquiry. Please try again.')}
        </div>
      )}

      {status !== 'success' && (
        <form class="rs-detail-inquiry__form" onSubmit={handleSubmit}>
          <div class="rs-detail-inquiry__name-row">
            <div class="rs-field">
              <label class="rs-field__label">
                {t('inquiry_first_name', 'First Name')} *
              </label>
              <input
                class="rs-input"
                type="text"
                value={firstName}
                onInput={(e) => setFirstName((e.target as HTMLInputElement).value)}
                required
              />
            </div>
            <div class="rs-field">
              <label class="rs-field__label">
                {t('inquiry_last_name', 'Last Name')} *
              </label>
              <input
                class="rs-input"
                type="text"
                value={lastName}
                onInput={(e) => setLastName((e.target as HTMLInputElement).value)}
                required
              />
            </div>
          </div>

          <div class="rs-field">
            <label class="rs-field__label">
              {t('inquiry_email', 'Your Email')} *
            </label>
            <input
              class="rs-input"
              type="email"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              required
            />
          </div>

          <div class="rs-field">
            <label class="rs-field__label">
              {t('inquiry_phone', 'Your Phone')}
            </label>
            <div class="rs-detail-inquiry__phone-row">
              <div class="rs-detail-inquiry__phone-code">
                <select
                  class="rs-detail-inquiry__phone-select"
                  value={selected.country}
                  aria-label={t('inquiry_phone', 'Your Phone')}
                  onChange={(e) => {
                    countryPicked.current = true;
                    setCountry((e.target as HTMLSelectElement).value);
                  }}
                >
                  {countries.map((c) => (
                    <option key={c.country} value={c.country}>
                      {c.flag} {c.name} {c.code}
                    </option>
                  ))}
                </select>
                <span class="rs-detail-inquiry__phone-display">
                  {selected.flag} {selected.code}
                </span>
              </div>
              <input
                class="rs-input rs-detail-inquiry__phone-input"
                type="tel"
                placeholder="600 000 000"
                value={phone}
                onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>

          <div class="rs-field">
            <label class="rs-field__label">
              {t('inquiry_message', 'Message')} *
            </label>
            <textarea
              class="rs-input rs-detail-inquiry__textarea"
              value={message}
              onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
              rows={4}
              required
            />
          </div>

          <label class="rs-detail-inquiry__privacy">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(e) => setPrivacyAccepted((e.target as HTMLInputElement).checked)}
              required
            />
            <span>
              {t('inquiry_privacy_prefix', 'I accept the')}{' '}
              <a
                href={t('inquiry_privacy_url', '/privacy-policy')}
                target="_blank"
                rel="noopener noreferrer"
                class="rs-detail-inquiry__privacy-link"
              >
                {t('inquiry_privacy_label', 'privacy policy')}
              </a>
            </span>
          </label>

          {siteKey && (
            <div class="rs-detail-inquiry__recaptcha" ref={captcha.ref} />
          )}

          <button
            class="rs-search-btn rs-detail-inquiry__submit"
            type="submit"
            disabled={status === 'sending' || !privacyAccepted || (!!siteKey && !recaptchaToken)}
          >
            {status === 'sending'
              ? t('inquiry_sending', 'Sending...')
              : t('inquiry_send', 'Send Inquiry')}
          </button>
        </form>
      )}
    </div>
  );
}
