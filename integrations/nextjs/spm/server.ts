// Server-side helpers: what the SPM WordPress plugin does in PHP, for a
// Next.js App Router site. Property pages get their title, description,
// Google/social preview tags and structured data in the HTML itself, and the
// sitemap lists every property.
import type { Metadata, MetadataRoute } from 'next';
import { SPM, spmPropertyPath } from './config';

type I18n = string | Record<string, string> | null | undefined;

export interface SpmProperty {
  id: number;
  reference: string;
  urlSegment?: string;
  title: I18n;
  description?: I18n;
  metaTitle?: I18n;
  metaDescription?: I18n;
  metaKeywords?: I18n;
  seoSchemaJson?: string | null;
  price?: number | string | null;
  priceOnRequest?: boolean;
  currency?: string;
  images?: Array<{ url?: string; order?: number } | string> | null;
  mainImage?: string;
  updatedAt?: string;
}

const REVALIDATE = 600; // seconds; dashboard edits show within 10 minutes

function text(value: I18n, lang: string): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[lang] || value[lang.split('-')[0]] || value.en || Object.values(value).find(Boolean) || '';
}

function clip(value: string, max: number): string {
  const plain = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length <= max ? plain : `${plain.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The reference(s) a URL segment may carry — the same rules the widget uses:
 * "villa-marbella_R123" → R123, "R123_villa-marbella" → R123, "R123" → R123.
 */
export function spmRefCandidates(segment: string): string[] {
  const s = decodeURIComponent(segment);
  const out: string[] = [];
  const add = (v?: string) => { if (v && !out.includes(v)) out.push(v); };
  const i = s.indexOf('_');
  if (i !== -1) {
    const left = s.slice(0, i);
    const right = s.slice(i + 1);
    if (/^[a-z0-9-]+$/.test(left)) { add(right); add(left); } else { add(left); add(s.slice(0, s.lastIndexOf('_'))); add(right); }
    return out;
  }
  const legacy = /[a-z]/.test(s) && s.includes('-') ? s.match(/^([a-z0-9-]+?)-([A-Z0-9][\w-]*)$/)?.[2] : undefined;
  add(legacy);
  add(s);
  return out;
}

/** The property a property page's URL segment points to, or null (→ notFound()). */
export async function spmGetProperty(segment: string, lang = 'en'): Promise<SpmProperty | null> {
  if (!SPM.apiKey) return null;
  for (const ref of spmRefCandidates(segment)) {
    try {
      const res = await fetch(`${SPM.apiUrl}/api/v1/properties/${encodeURIComponent(ref)}?lang=${encodeURIComponent(lang)}`, {
        headers: { 'x-api-key': SPM.apiKey, 'Accept-Language': lang },
        next: { revalidate: REVALIDATE },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const property = (json?.data ?? json) as SpmProperty;
      if (property?.reference) return property;
    } catch {
      // API unreachable: try the next candidate, then give up
    }
  }
  return null;
}

function firstImage(p: SpmProperty): string | undefined {
  if (p.mainImage) return p.mainImage;
  const images = [...(p.images || [])].sort((a, b) => (typeof a === 'object' ? a.order ?? 0 : 0) - (typeof b === 'object' ? b.order ?? 0 : 0));
  const first = images[0];
  return typeof first === 'string' ? first : first?.url;
}

export interface SpmSeoOptions {
  lang?: string;
  /** Appended to the title when the agent wrote no Meta Title: "Villa in Marbella | Cristi Homes". */
  siteName?: string;
  defaultLang?: string;
}

function seoValues(p: SpmProperty, opts: SpmSeoOptions) {
  const lang = opts.lang || 'en';
  const title = text(p.title, lang).trim();
  const metaTitle = text(p.metaTitle, lang).trim();
  const metaDescription = text(p.metaDescription, lang).trim();
  const path = spmPropertyPath(p.urlSegment || p.reference, lang, opts.defaultLang);
  return {
    // An agent's Meta Title is the whole title, as they wrote it.
    title: metaTitle || (title ? `${title}${opts.siteName ? ` | ${opts.siteName}` : ''}` : opts.siteName || p.reference),
    description: clip(metaDescription || text(p.description, lang), 300),
    keywords: text(p.metaKeywords, lang).replace(/<[^>]*>/g, '').trim(),
    url: SPM.siteUrl ? `${SPM.siteUrl}${path}` : path,
    image: firstImage(p),
    name: title,
  };
}

/** For generateMetadata() on the property page. */
export async function spmPropertyMetadata(segment: string, opts: SpmSeoOptions = {}): Promise<Metadata> {
  const p = await spmGetProperty(segment, opts.lang);
  if (!p) return { title: opts.siteName ? `Property not found | ${opts.siteName}` : 'Property not found', robots: { index: false } };
  const s = seoValues(p, opts);
  return {
    title: { absolute: s.title },
    description: s.description || undefined,
    keywords: s.keywords || undefined,
    alternates: { canonical: s.url },
    openGraph: {
      type: 'website',
      title: s.title,
      description: s.description || undefined,
      url: s.url,
      siteName: opts.siteName,
      locale: opts.lang,
      images: s.image ? [{ url: s.image, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: s.image ? 'summary_large_image' : 'summary',
      title: s.title,
      description: s.description || undefined,
      images: s.image ? [s.image] : undefined,
    },
  };
}

/**
 * schema.org data for the property page (the agent's own schema when they
 * wrote one). Render with <SpmJsonLd property={...} />.
 */
export function spmPropertyJsonLd(p: SpmProperty, opts: SpmSeoOptions = {}): Record<string, unknown> {
  if (p.seoSchemaJson) {
    try {
      const custom = JSON.parse(p.seoSchemaJson);
      if (custom && typeof custom === 'object') return custom;
    } catch { /* invalid: use ours */ }
  }
  const s = seoValues(p, opts);
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: s.name,
    description: s.description,
    url: s.url,
    identifier: p.reference,
  };
  if (s.image) node.image = s.image;
  if (p.updatedAt) node.dateModified = p.updatedAt;
  if (p.price !== null && p.price !== undefined && p.price !== '' && !p.priceOnRequest) {
    node.offers = { '@type': 'Offer', price: String(p.price), priceCurrency: p.currency || 'EUR', availability: 'https://schema.org/InStock', url: s.url };
  }
  return node;
}

/** The JSON-LD as a string safe inside <script> (no "</script>" breakout). */
export function spmJsonLdString(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Every published property for app/sitemap.ts. Needs NEXT_PUBLIC_SITE_URL. */
export async function spmSitemap(opts: { lang?: string; defaultLang?: string } = {}): Promise<MetadataRoute.Sitemap> {
  if (!SPM.apiKey || !SPM.siteUrl) return [];
  const lang = opts.lang || 'en';
  try {
    const res = await fetch(`${SPM.apiUrl}/api/v1/property-refs?lang=${encodeURIComponent(lang)}&limit=50000`, {
      headers: { 'x-api-key': SPM.apiKey },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    const rows = (json?.data ?? json) as Array<{ reference: string; segment?: string; updatedAt?: string }>;
    return rows.map((r) => ({
      url: `${SPM.siteUrl}${spmPropertyPath(r.segment || r.reference, lang, opts.defaultLang)}`,
      lastModified: r.updatedAt ? new Date(r.updatedAt) : undefined,
      changeFrequency: 'weekly' as const,
    }));
  } catch {
    return [];
  }
}

/** The widget build to load (?ver=), so a widget update isn't held back by a cache. */
export async function spmWidgetVersion(): Promise<string | undefined> {
  try {
    const res = await fetch(`${SPM.widgetUrl}/version.json`, { next: { revalidate: 300 } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { version?: string };
    return json.version;
  } catch {
    return undefined;
  }
}
