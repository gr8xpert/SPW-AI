import { isCountry } from '@/components/detail/country-codes';

// The visitor's country from the API (Cloudflare knows it from their IP),
// asked once per browser session, for the phone code on the website forms
// (inquiry, wishlist form). Null when unknown.
let visitorCountry: Promise<string | null> | null = null;

export function askVisitorCountry(apiUrl: string): Promise<string | null> {
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
