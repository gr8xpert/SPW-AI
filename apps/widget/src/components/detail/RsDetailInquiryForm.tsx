import { useState, useCallback } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';
import type { Property } from '@/types';

interface Props {
  property?: Property;
}

export default function RsDetailInquiryForm({ property: propertyProp }: Props) {
  const { t } = useLabels();
  const config = useConfig();
  const storeProperty = useSelector(selectors.getSelectedProperty);
  const property = propertyProp ?? storeProperty;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const handleSubmit = useCallback(
    async (e: Event) => {
      e.preventDefault();
      if (!property) return;
      setStatus('sending');

      try {
        const apiUrl = config.apiUrl.replace(/\/$/, '');
        const res = await fetch(`${apiUrl}/api/v1/inquiry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': config.apiKey,
          },
          body: JSON.stringify({
            propertyId: property.id,
            propertyReference: property.reference,
            name,
            email,
            phone,
            message,
          }),
        });

        if (!res.ok) throw new Error('Failed to send inquiry');

        setStatus('success');
        setName('');
        setEmail('');
        setPhone('');
        setMessage('');
      } catch {
        setStatus('error');
      }
    },
    [config.apiUrl, config.apiKey, property, name, email, phone, message],
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
          <div class="rs-field">
            <label class="rs-field__label">
              {t('inquiry_name', 'Name')}
            </label>
            <input
              class="rs-input"
              type="text"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              required
            />
          </div>

          <div class="rs-field">
            <label class="rs-field__label">
              {t('inquiry_email', 'Email')}
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
              {t('inquiry_phone', 'Phone')}
            </label>
            <input
              class="rs-input"
              type="tel"
              value={phone}
              onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
            />
          </div>

          <div class="rs-field">
            <label class="rs-field__label">
              {t('inquiry_message', 'Message')}
            </label>
            <textarea
              class="rs-input rs-detail-inquiry__textarea"
              value={message}
              onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
              rows={4}
              required
            />
          </div>

          <button
            class="rs-search-btn rs-detail-inquiry__submit"
            type="submit"
            disabled={status === 'sending'}
          >
            {t('inquiry_send', 'Send Inquiry')}
          </button>
        </form>
      )}
    </div>
  );
}
