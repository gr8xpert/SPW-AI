import type { Property, WidgetConfig } from '@/types';
import { buildPropertyUrl } from '@/core/url-utils';

// Page <title>, meta description / keywords and JSON-LD for a property page,
// from the property's SEO section in the dashboard. On WordPress the plugin
// already wrote them server-side (and marks the page with
// <meta name="spm-seo" content="server">), so this only runs on other sites.
// Search engines render JavaScript, so the tags still count there.
export function applyPropertySeo(property: Property, config?: WidgetConfig): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('meta[name="spm-seo"][content="server"], meta[name="spw-seo"][content="server"]')) return;

  // One canonical, the property's clean address: a visit with extra
  // parameters (?page=2, tracking, a stray ?ref=) must not count as a page of
  // its own, or crawlers can loop through endless variants of it.
  if (config) setCanonical(buildPropertyUrl(property, config));

  const title = (property.metaTitle || property.title || '').trim();
  if (title) document.title = title;

  const description = (property.metaDescription || plain(property.description)).trim().slice(0, 300);
  if (description) setMeta('description', description);
  if (property.metaKeywords) setMeta('keywords', property.metaKeywords);

  const schema = parseSchema(property.seoSchemaJson);
  if (schema && !document.querySelector('script[data-spw-schema]')) {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-spw-schema', 'widget');
    s.textContent = JSON.stringify(schema);
    document.head.appendChild(s);
  }
}

function setCanonical(href: string): void {
  if (!href || href === '#') return;
  let url: string;
  try { url = new URL(href, window.location.href).href; } catch { return; }
  const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'));
  links.slice(1).forEach((l) => l.remove());
  let el = links[0];
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = url;
}

function setMeta(name: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function plain(html: string | undefined): string {
  if (!html) return '';
  // DOMParser builds an inert document: no scripts run, no images load.
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ');
}

// The agent's custom schema, only if it is valid JSON.
function parseSchema(raw: string | null | undefined): unknown {
  if (!raw || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}
