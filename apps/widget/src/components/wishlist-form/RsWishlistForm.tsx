import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useConfig } from '@/hooks/useConfig';
import { useCurrency } from '@/hooks/useCurrency';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { FacetsEnabled } from '@/hooks/useFacets';
import { LocationPicker } from '@/components/search/RsLocation';
import { PropertyTypePicker } from '@/components/search/RsPropertyType';
import { priceSteps } from '@/components/search/RsPrice';
import RsCustomSelect from '@/components/search/RsCustomSelect';
import { countryCodes, guessCountry } from '@/components/detail/country-codes';
import { askVisitorCountry } from '@/core/visitor-country';
import WishlistFeatures from './WishlistFeatures';

// The website wishlist form ([data-spm-widget="wishlist-form"]): the visitor
// fills in what they are looking for, a few questions about themselves and
// their details. It keeps its own state and never touches the page's search
// filters. Sent privately in the body (the old form put names and phones in
// the address). All words are client labels (Labels → Wishlist Form).

interface Question {
  key: string;
  label: string;
  multiple: boolean;
  options: { key: string; label: string }[];
}

const LISTING_TYPES = [
  { value: 'sale', labelKey: 'listing_type_sale', fallback: 'For Sale' },
  { value: 'development', labelKey: 'listing_type_development', fallback: 'New Development' },
  { value: 'rent', labelKey: 'listing_type_rent', fallback: 'For Rent' },
  { value: 'holiday_rent', labelKey: 'listing_type_holiday', fallback: 'Holiday Rental' },
];
const CONTACTS = [
  { value: 'email', labelKey: 'wishlist_form_contact_email', fallback: 'Email' },
  { value: 'call', labelKey: 'wishlist_form_contact_call', fallback: 'Phone call' },
  { value: 'whatsapp', labelKey: 'wishlist_form_contact_whatsapp', fallback: 'WhatsApp' },
];
const LANGUAGES = ['en', 'es', 'nl', 'de', 'fr', 'it', 'pt', 'sv', 'no', 'da', 'fi', 'pl', 'ru'];
const SIZE_STEPS = [50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
const PLOT_STEPS = [250, 500, 750, 1000, 1500, 2000, 2500, 5000, 10000];

function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) || code;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
}

type Status = 'idle' | 'sending' | 'success' | 'error';

export default function RsWishlistForm() {
  const { t } = useLabels();
  const config = useConfig();
  const { formatPrice } = useCurrency();
  const lang = (config.language || 'en').slice(0, 2);
  const captcha = useRecaptcha();

  // What they are looking for
  const enabled = config.enabledListingTypes?.length ? config.enabledListingTypes : LISTING_TYPES.map((l) => l.value);
  const listingChoices = LISTING_TYPES.filter((l) => enabled.includes(l.value));
  const [listingTypes, setListingTypes] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<number[]>([]);
  const [typeIds, setTypeIds] = useState<number[]>([]);
  const [featureIds, setFeatureIds] = useState<number[]>([]);
  const [minBedrooms, setMinBedrooms] = useState('');
  const [minBathrooms, setMinBathrooms] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [minBuildSize, setMinBuildSize] = useState('');
  const [minPlotSize, setMinPlotSize] = useState('');

  // About them
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});

  // Their details
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const countries = countryCodes(lang);
  const [country, setCountry] = useState(() => guessCountry() || 'ES');
  const countryPicked = useRef(false);
  const [phone, setPhone] = useState('');
  const [preferredContact, setPreferredContact] = useState('');
  const [language, setLanguage] = useState(LANGUAGES.includes(lang) ? lang : 'en');
  const [notes, setNotes] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  // Three steps (property, about you, details); "about you" only when the
  // agency put questions on the form. All steps stay mounted (hidden), so
  // nothing typed is lost and reCAPTCHA keeps its box.
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const apiUrl = config.apiUrl.replace(/\/$/, '');

  useEffect(() => {
    let live = true;
    void askVisitorCountry(config.apiUrl).then((c) => {
      if (live && c && !countryPicked.current) setCountry(c);
    });
    return () => { live = false; };
  }, [config.apiUrl]);

  useEffect(() => {
    let live = true;
    fetch(`${apiUrl}/api/v1/buyer-questions?lang=${encodeURIComponent(lang)}`, { headers: { 'X-API-Key': config.apiKey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
        if (live) setQuestions(list as Question[]);
      })
      .catch(() => { /* the form works without questions */ });
    return () => { live = false; };
  }, [apiUrl, config.apiKey, lang]);

  const budgetType = listingTypes[0] || 'sale';
  const prices = useMemo(() => priceSteps(config, budgetType), [config.priceOptions, config.minPrices, budgetType]);
  const anyLabel = t('wishlist_form_any', 'Any');
  const numberOptions = (nums: number[], fmt: (n: number) => string) => [{ value: '', label: anyLabel }, ...nums.map((n) => ({ value: String(n), label: fmt(n) }))];
  const bedOptions = numberOptions(config.bedroomOptions ?? [1, 2, 3, 4, 5, 6], (n) => `${n}+`);
  const bathOptions = numberOptions(config.bathroomOptions ?? [1, 2, 3, 4, 5], (n) => `${n}+`);
  const minPriceOptions = numberOptions(prices, formatPrice);
  const maxPriceOptions = numberOptions(budgetMin ? prices.filter((p) => p > Number(budgetMin)) : prices, formatPrice);
  const sizeOptions = numberOptions(SIZE_STEPS, (n) => `${n} m²`);
  const plotOptions = numberOptions(PLOT_STEPS, (n) => `${n.toLocaleString(lang)} m²`);
  const selectedCountry = countries.find((c) => c.country === country) || countries.find((c) => c.country === 'ES') || countries[0];

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const answer = (q: Question, key: string) => {
    setAnswers((prev) => {
      const current = prev[q.key] ?? [];
      const next = q.multiple ? toggle(current, key) : current.includes(key) ? [] : [key];
      return { ...prev, [q.key]: next };
    });
  };

  const steps = [
    { key: 'property', label: t('wishlist_form_section_property', 'Your ideal property') },
    ...(questions.length > 0 ? [{ key: 'about', label: t('wishlist_form_section_about', 'About you') }] : []),
    { key: 'contact', label: t('wishlist_form_section_contact', 'Your details') },
  ];
  const current = Math.min(step, steps.length - 1);
  const last = current === steps.length - 1;
  const shown = (key: string) => steps[current].key === key;
  const go = (to: number) => {
    setStep(Math.max(0, Math.min(steps.length - 1, to)));
    // Back to the top of the form when it has scrolled away.
    const top = formRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    // Enter on an earlier step moves on instead of sending.
    if (!last) {
      go(current + 1);
      return;
    }
    if (!privacy || (captcha.siteKey && !captcha.token)) return;
    setStatus('sending');
    const num = (v: string) => (v ? Number(v) : undefined);
    const body: Record<string, unknown> = {
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim() || undefined,
      phone: phone.trim() ? `${selectedCountry.code} ${phone.trim()}` : undefined,
      preferredContact: preferredContact || undefined,
      language,
      notes: notes.trim() || undefined,
      wishlist: {
        listingTypes: listingTypes.length ? listingTypes : undefined,
        locationIds: locationIds.length ? locationIds : undefined,
        propertyTypeIds: typeIds.length ? typeIds : undefined,
        featureIds: featureIds.length ? featureIds : undefined,
        minBedrooms: num(minBedrooms),
        minBathrooms: num(minBathrooms),
        budgetMin: num(budgetMin),
        budgetMax: num(budgetMax),
        minBuildSize: num(minBuildSize),
        minPlotSize: num(minPlotSize),
        currency: config.currency && /^[A-Z]{3}$/.test(config.currency) ? config.currency : undefined,
      },
      answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => v.length)),
      privacyAccepted: true,
      lang,
      pageUrl: window.location.href.slice(0, 1000),
    };
    if (captcha.siteKey && captcha.token) body.recaptchaToken = captcha.token;
    try {
      const res = await fetch(`${apiUrl}/api/v1/buyer-wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': config.apiKey },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('success');
    } catch {
      setStatus('error');
      captcha.reset();
    }
  };

  if (status === 'success') {
    return (
      <div class="rs-wishlist-form">
        <div class="rs-wishlist-form__done" role="status">
          {t('wishlist_form_success', 'Thank you! We have received your wishlist and will be in touch soon.')}
        </div>
      </div>
    );
  }

  return (
    <FacetsEnabled.Provider value={false}>
      <form class="rs-wishlist-form" onSubmit={submit} ref={formRef} noValidate={!last} data-step={steps[current].key}>
        <h3 class="rs-wishlist-form__title">{t('wishlist_form_title', "Tell us what you're looking for")}</h3>
        <p class="rs-wishlist-form__intro">{t('wishlist_form_intro', 'Fill in your wishlist and we will send you the properties that match.')}</p>

        <ol class="rs-wishlist-form__steps" aria-label={t('wishlist_form_steps', 'Steps')}>
          {steps.map((s, i) => (
            <li
              key={s.key}
              class={`rs-wishlist-form__step${i === current ? ' is-current' : ''}${i < current ? ' is-done' : ''}`}
              aria-current={i === current ? 'step' : undefined}
            >
              <button type="button" class="rs-wishlist-form__step-btn" onClick={() => i < current && go(i)} disabled={i >= current} data-step-index={i}>
                <span class="rs-wishlist-form__step-num">{i < current ? '✓' : i + 1}</span>
                <span class="rs-wishlist-form__step-label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>

        <fieldset class="rs-wishlist-form__section" hidden={!shown('property')}>
          <legend class="rs-wishlist-form__legend">{t('wishlist_form_section_property', 'Your ideal property')}</legend>

          {listingChoices.length > 1 && (
            <div class="rs-field rs-wishlist-form__wide">
              <span class="rs-field__label">{t('wishlist_form_listing_type', 'I am looking to')}</span>
              <div class="rs-tags">
                {listingChoices.map((l) => (
                  <button
                    key={l.value}
                    type="button"
                    class={`rs-tag${listingTypes.includes(l.value) ? ' rs-tag--active' : ''}`}
                    aria-pressed={listingTypes.includes(l.value)}
                    onClick={() => setListingTypes(toggle(listingTypes, l.value))}
                  >
                    {t(l.labelKey, l.fallback)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div class="rs-field rs-wishlist-form__wide">
            <span class="rs-field__label">{t('wishlist_form_locations', 'Locations')}</span>
            <LocationPicker value={locationIds} onChange={setLocationIds} facets={false} />
          </div>
          <div class="rs-field">
            <span class="rs-field__label">{t('wishlist_form_types', 'Property types')}</span>
            <PropertyTypePicker value={typeIds} onChange={setTypeIds} facets={false} placeholder={anyLabel} />
          </div>
          <div class="rs-wishlist-form__pair rs-wishlist-form__pair--short">
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_bedrooms', 'Bedrooms (min.)')}</span>
              <RsCustomSelect options={bedOptions} value={minBedrooms} onChange={setMinBedrooms} placeholder={anyLabel} />
            </div>
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_bathrooms', 'Bathrooms (min.)')}</span>
              <RsCustomSelect options={bathOptions} value={minBathrooms} onChange={setMinBathrooms} placeholder={anyLabel} />
            </div>
          </div>
          <div class="rs-wishlist-form__pair rs-wishlist-form__pair--short">
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_budget_min', 'Budget from')}</span>
              <RsCustomSelect
                options={minPriceOptions}
                value={budgetMin}
                onChange={(v) => {
                  setBudgetMin(v);
                  if (v && budgetMax && Number(budgetMax) <= Number(v)) setBudgetMax('');
                }}
                placeholder={anyLabel}
              />
            </div>
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_budget_max', 'Budget up to')}</span>
              <RsCustomSelect options={maxPriceOptions} value={budgetMax} onChange={setBudgetMax} placeholder={anyLabel} />
            </div>
          </div>
          <div class="rs-wishlist-form__pair rs-wishlist-form__pair--short">
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_build_size', 'Build size from (m²)')}</span>
              <RsCustomSelect options={sizeOptions} value={minBuildSize} onChange={setMinBuildSize} placeholder={anyLabel} />
            </div>
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_plot_size', 'Plot size from (m²)')}</span>
              <RsCustomSelect options={plotOptions} value={minPlotSize} onChange={setMinPlotSize} placeholder={anyLabel} />
            </div>
          </div>
          <div class="rs-field rs-wishlist-form__wide">
            <span class="rs-field__label">{t('wishlist_form_features', 'Features')}</span>
            <WishlistFeatures value={featureIds} onChange={setFeatureIds} />
          </div>
        </fieldset>

        {questions.length > 0 && (
          <fieldset class="rs-wishlist-form__section" hidden={!shown('about')}>
            <legend class="rs-wishlist-form__legend">{t('wishlist_form_section_about', 'About you')}</legend>
            {questions.map((q) => (
              <div key={q.key} class="rs-field rs-wishlist-form__question" role="group" aria-label={q.label}>
                <span class="rs-field__label">{q.label}</span>
                <div class="rs-tags">
                  {q.options.map((o) => {
                    const on = (answers[q.key] ?? []).includes(o.key);
                    return (
                      <button
                        key={o.key}
                        type="button"
                        class={`rs-tag${on ? ' rs-tag--active' : ''}`}
                        aria-pressed={on}
                        onClick={() => answer(q, o.key)}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        )}

        <fieldset class="rs-wishlist-form__section" hidden={!shown('contact')}>
          <legend class="rs-wishlist-form__legend">{t('wishlist_form_section_contact', 'Your details')}</legend>
          <>
            <label class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_first_name', 'First name')} *</span>
              <input class="rs-input" type="text" name="firstName" autocomplete="given-name" maxLength={100} required value={firstName} onInput={(e) => setFirstName((e.target as HTMLInputElement).value)} />
            </label>
            <label class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_last_name', 'Last name')}</span>
              <input class="rs-input" type="text" name="lastName" autocomplete="family-name" maxLength={100} value={lastName} onInput={(e) => setLastName((e.target as HTMLInputElement).value)} />
            </label>
          </>
          <>
            <label class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_email', 'Email')} *</span>
              <input class="rs-input" type="email" name="email" autocomplete="email" maxLength={254} required value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
            </label>
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_phone', 'Phone')}</span>
              <div class="rs-detail-inquiry__phone-row">
                <div class="rs-detail-inquiry__phone-code">
                  <select
                    class="rs-detail-inquiry__phone-select"
                    value={selectedCountry.country}
                    aria-label={t('wishlist_form_phone', 'Phone')}
                    onChange={(e) => {
                      countryPicked.current = true;
                      setCountry((e.target as HTMLSelectElement).value);
                    }}
                  >
                    {countries.map((c) => (
                      <option key={c.country} value={c.country}>{c.flag} {c.name} {c.code}</option>
                    ))}
                  </select>
                  <span class="rs-detail-inquiry__phone-display">{selectedCountry.flag} {selectedCountry.code}</span>
                </div>
                <input class="rs-input rs-detail-inquiry__phone-input" type="tel" name="phone" autocomplete="tel-national" maxLength={30} placeholder="600 000 000" value={phone} onInput={(e) => setPhone((e.target as HTMLInputElement).value)} />
              </div>
            </div>
          </>
          <>
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_preferred_contact', 'I prefer to be contacted by')}</span>
              <div class="rs-tags">
                {CONTACTS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    class={`rs-tag${preferredContact === c.value ? ' rs-tag--active' : ''}`}
                    aria-pressed={preferredContact === c.value}
                    onClick={() => setPreferredContact(preferredContact === c.value ? '' : c.value)}
                  >
                    {t(c.labelKey, c.fallback)}
                  </button>
                ))}
              </div>
            </div>
            <div class="rs-field">
              <span class="rs-field__label">{t('wishlist_form_language', 'Language')}</span>
              <RsCustomSelect options={LANGUAGES.map((l) => ({ value: l, label: languageName(l) }))} value={language} onChange={setLanguage} />
            </div>
          </>
          <label class="rs-field rs-wishlist-form__wide">
            <span class="rs-field__label">{t('wishlist_form_notes', 'Anything else we should know?')}</span>
            <textarea class="rs-input rs-detail-inquiry__textarea" rows={3} maxLength={5000} value={notes} onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)} />
          </label>

          <label class="rs-detail-inquiry__privacy rs-wishlist-form__wide">
            <input type="checkbox" checked={privacy} required onChange={(e) => setPrivacy((e.target as HTMLInputElement).checked)} />
            <span>
              {t('inquiry_privacy_prefix', 'I accept the')}{' '}
              <a href={t('inquiry_privacy_url', '/privacy-policy')} target="_blank" rel="noopener noreferrer" class="rs-detail-inquiry__privacy-link">
                {t('inquiry_privacy_label', 'privacy policy')}
              </a>
            </span>
          </label>
          {captcha.siteKey && <div class="rs-detail-inquiry__recaptcha rs-wishlist-form__wide" ref={captcha.ref} />}
        </fieldset>

        {status === 'error' && last && (
          <div class="rs-detail-inquiry__message rs-detail-inquiry__message--error" role="alert">
            {t('wishlist_form_error', 'Something went wrong. Please try again.')}
          </div>
        )}
        <div class="rs-wishlist-form__nav">
          {current > 0 && (
            <button type="button" class="rs-reset-btn rs-wishlist-form__back" onClick={() => go(current - 1)}>
              {t('wishlist_form_back', 'Back')}
            </button>
          )}
          {last ? (
            <button class="rs-search-btn rs-wishlist-form__submit" type="submit" disabled={status === 'sending' || !privacy || !captcha.ready}>
              {status === 'sending' ? t('wishlist_form_sending', 'Sending...') : t('wishlist_form_submit', 'Send my wishlist')}
            </button>
          ) : (
            <button type="button" class="rs-search-btn rs-wishlist-form__next" onClick={() => go(current + 1)}>
              {t('wishlist_form_next', 'Next')}
            </button>
          )}
        </div>
      </form>
    </FacetsEnabled.Provider>
  );
}
