import { propertyLink } from '../lead/buyer/buyer-mail';
import type { BuyerPropertyCard } from '../lead/buyer/buyer-property-card';

// Where a listing lives on the client's website, for the dashboard's "View on
// website". In order: the address typed on the listing, the client's URL
// pattern (Contacts settings), the folder the WordPress plugin reported.

export interface WebsiteLinkContext {
  lang: string;
  patterns: Record<string, string>;
  slugFormat: unknown;
  // "https://site.com/property/"; null = no plugin reported one.
  detailPageUrl: string | null;
}

type LinkInput = Pick<BuyerPropertyCard, 'reference' | 'title' | 'slug' | 'location' | 'propertyType'> & {
  websiteUrl?: string | null;
};

export function propertyWebsiteLink(p: LinkInput, ctx: WebsiteLinkContext): string | null {
  const own = p.websiteUrl?.trim();
  if (own && /^https?:\/\/\S+$/i.test(own)) return own;
  const hasPattern = !!(ctx.patterns[ctx.lang] || ctx.patterns.default);
  const patterns =
    !hasPattern && ctx.detailPageUrl
      ? { default: `${ctx.detailPageUrl.replace(/\/+$/, '')}/{segment}` }
      : ctx.patterns;
  return propertyLink(p, ctx.lang, patterns, ctx.slugFormat);
}
