// SPM (Smart Property Manager) settings for a Next.js site. Set these in
// .env.local (and in the host's environment for production):
//
//   NEXT_PUBLIC_SPM_KEY=spm_...            Dashboard → Settings → API Keys
//   NEXT_PUBLIC_SITE_URL=https://www.example.com
//   NEXT_PUBLIC_SPM_PROPERTY_SLUG=property  (optional; the property page's folder)
//
// The key is the site's public widget key — the same one any page with the
// widget shows — so NEXT_PUBLIC_ is fine.

export const SPM = {
  apiUrl: (process.env.NEXT_PUBLIC_SPM_API_URL || 'https://api.spw-ai.com').replace(/\/$/, ''),
  apiKey: process.env.NEXT_PUBLIC_SPM_KEY || '',
  widgetUrl: (process.env.NEXT_PUBLIC_SPM_WIDGET_URL || 'https://spw-ai.com/widget').replace(/\/$/, ''),
  propertySlug: (process.env.NEXT_PUBLIC_SPM_PROPERTY_SLUG || 'property').replace(/^\/|\/$/g, ''),
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, ''),
};

/** The address of a property page on this site, from the API's urlSegment. */
export function spmPropertyPath(segment: string, lang?: string, defaultLang = 'en'): string {
  const prefix = lang && lang !== defaultLang ? `/${lang}` : '';
  return `${prefix}/${SPM.propertySlug}/${encodeURIComponent(segment)}`;
}
