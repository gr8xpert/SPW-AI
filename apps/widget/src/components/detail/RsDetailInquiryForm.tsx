import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Property } from '@/types';

const COUNTRY_CODES = [
  { code: '+34', flag: '\u{1F1EA}\u{1F1F8}', country: 'ES' },
  { code: '+44', flag: '\u{1F1EC}\u{1F1E7}', country: 'GB' },
  { code: '+1', flag: '\u{1F1FA}\u{1F1F8}', country: 'US' },
  { code: '+33', flag: '\u{1F1EB}\u{1F1F7}', country: 'FR' },
  { code: '+49', flag: '\u{1F1E9}\u{1F1EA}', country: 'DE' },
  { code: '+31', flag: '\u{1F1F3}\u{1F1F1}', country: 'NL' },
  { code: '+39', flag: '\u{1F1EE}\u{1F1F9}', country: 'IT' },
  { code: '+351', flag: '\u{1F1F5}\u{1F1F9}', country: 'PT' },
  { code: '+46', flag: '\u{1F1F8}\u{1F1EA}', country: 'SE' },
  { code: '+47', flag: '\u{1F1F3}\u{1F1F4}', country: 'NO' },
  { code: '+45', flag: '\u{1F1E9}\u{1F1F0}', country: 'DK' },
  { code: '+358', flag: '\u{1F1EB}\u{1F1EE}', country: 'FI' },
  { code: '+48', flag: '\u{1F1F5}\u{1F1F1}', country: 'PL' },
  { code: '+7', flag: '\u{1F1F7}\u{1F1FA}', country: 'RU' },
  { code: '+971', flag: '\u{1F1E6}\u{1F1EA}', country: 'AE' },
  { code: '+966', flag: '\u{1F1F8}\u{1F1E6}', country: 'SA' },
  { code: '+91', flag: '\u{1F1EE}\u{1F1F3}', country: 'IN' },
  { code: '+86', flag: '\u{1F1E8}\u{1F1F3}', country: 'CN' },
  { code: '+81', flag: '\u{1F1EF}\u{1F1F5}', country: 'JP' },
  { code: '+61', flag: '\u{1F1E6}\u{1F1FA}', country: 'AU' },
  { code: '+55', flag: '\u{1F1E7}\u{1F1F7}', country: 'BR' },
  { code: '+27', flag: '\u{1F1FF}\u{1F1E6}', country: 'ZA' },
  { code: '+90', flag: '\u{1F1F9}\u{1F1F7}', country: 'TR' },
  { code: '+30', flag: '\u{1F1EC}\u{1F1F7}', country: 'GR' },
  { code: '+41', flag: '\u{1F1E8}\u{1F1ED}', country: 'CH' },
  { code: '+43', flag: '\u{1F1E6}\u{1F1F9}', country: 'AT' },
  { code: '+32', flag: '\u{1F1E7}\u{1F1EA}', country: 'BE' },
  { code: '+353', flag: '\u{1F1EE}\u{1F1EA}', country: 'IE' },
  { code: '+52', flag: '\u{1F1F2}\u{1F1FD}', country: 'MX' },
  { code: '+212', flag: '\u{1F1F2}\u{1F1E6}', country: 'MA' },
];

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'Europe/Madrid': 'ES', 'Europe/London': 'GB', 'America/New_York': 'US',
  'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL',
  'Europe/Rome': 'IT', 'Europe/Lisbon': 'PT', 'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL', 'Europe/Moscow': 'RU', 'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA', 'Asia/Kolkata': 'IN', 'Asia/Shanghai': 'CN',
  'Asia/Tokyo': 'JP', 'Australia/Sydney': 'AU', 'America/Sao_Paulo': 'BR',
  'Africa/Johannesburg': 'ZA', 'Europe/Istanbul': 'TR', 'Europe/Athens': 'GR',
  'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Brussels': 'BE',
  'Europe/Dublin': 'IE', 'America/Mexico_City': 'MX', 'Africa/Casablanca': 'MA',
  'America/Toronto': 'US', 'Pacific/Auckland': 'AU', 'Asia/Singapore': 'IN',
  'Asia/Hong_Kong': 'CN', 'Europe/Prague': 'DE', 'Europe/Budapest': 'DE',
  'Europe/Bucharest': 'RU', 'Europe/Kiev': 'RU',
};

function detectCountryCode(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const country = TIMEZONE_TO_COUNTRY[tz];
    if (country) {
      const entry = COUNTRY_CODES.find((c) => c.country === country);
      if (entry) return entry.code;
    }

    const locale = navigator.language || '';
    const region = locale.split('-')[1]?.toUpperCase();
    if (region) {
      const entry = COUNTRY_CODES.find((c) => c.country === region);
      if (entry) return entry.code;
    }
  } catch { /* detection unavailable */ }
  return COUNTRY_CODES[0].code;
}

interface Props {
  property?: Property;
}

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void }) => number;
      reset: (widgetId: number) => void;
    };
  }
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
  const [countryCode, setCountryCode] = useState(() => detectCountryCode());
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);

  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaWidgetId = useRef<number | null>(null);
  const recaptchaLoaded = useRef(false);

  const siteKey = (config as any).recaptchaSiteKey as string | undefined;

  useEffect(() => {
    if (property && !message) {
      setMessage(buildDefaultMessage(property, t));
    }
  }, [property]);

  useEffect(() => {
    if (!siteKey || recaptchaLoaded.current) return;
    recaptchaLoaded.current = true;

    const existing = document.querySelector('script[src*="recaptcha/api.js"]');
    if (existing) {
      renderRecaptcha();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => renderRecaptcha();
    document.head.appendChild(script);
  }, [siteKey]);

  function renderRecaptcha() {
    if (!siteKey || !recaptchaRef.current || recaptchaWidgetId.current != null) return;

    const tryRender = () => {
      if (!window.grecaptcha?.render) {
        setTimeout(tryRender, 200);
        return;
      }
      window.grecaptcha.ready(() => {
        if (!recaptchaRef.current || recaptchaWidgetId.current != null) return;
        recaptchaWidgetId.current = window.grecaptcha!.render(recaptchaRef.current, {
          sitekey: siteKey!,
          callback: (token: string) => setRecaptchaToken(token),
          'expired-callback': () => setRecaptchaToken(null),
        });
      });
    };
    tryRender();
  }

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
        setRecaptchaToken(null);
        if (recaptchaWidgetId.current != null && window.grecaptcha) {
          window.grecaptcha.reset(recaptchaWidgetId.current);
        }
      } catch {
        setStatus('error');
      }
    },
    [config.apiUrl, config.apiKey, property, firstName, lastName, email, countryCode, phone, message, siteKey, recaptchaToken],
  );

  if (!property) return null;

  const selected = COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];

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
                  value={countryCode}
                  onChange={(e) => setCountryCode((e.target as HTMLSelectElement).value)}
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
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
            <div class="rs-detail-inquiry__recaptcha" ref={recaptchaRef} />
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
