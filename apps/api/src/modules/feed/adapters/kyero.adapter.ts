import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import {
  BaseFeedAdapter,
  FeedProperty,
  FeedImportResult,
  FeedPropertyImage,
  FeedValidationResult,
} from './base.adapter';
import { FeedCredentials } from '../../../database/entities/feed-config.entity';
import { cleanMultilingual, loadXmlFeedPage, probeXml, toEnergyRating, toNumber } from './xml-feed';

// Kyero XML import feed, V3 (help.kyero.com/estate-agents/xml-import-specification):
// <root><kyero><feed_version>3</feed_version></kyero><property>…</property>…</root>
// Per-tenant: each client enters their feed URL in credentials.endpoint; the
// obscure URL itself is the credential. Checked against a real feed
// (morairainvest.com, 2026-10-12).
//
// Image policy (Task #4): URLs from the feed are kept as-is. Since the
// provider's CDN is already serving them publicly, we don't re-host —
// we only push to R2 for client-uploaded images.
@Injectable()
export class KyeroAdapter extends BaseFeedAdapter {
  readonly provider = 'kyero';
  readonly displayName = 'Kyero';

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // Keep values as text (ids, refs with leading zeros); numbers are parsed per field.
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    // Feeds write accents as numeric entities (J&#xE1;vea, &#13;); the parser
    // leaves those alone unless told to decode them, and its default cap of
    // 1,000 expansions per document is a few listings' worth. The DOCTYPE
    // limits (entity count, size, depth) stay at their defaults.
    htmlEntities: true,
    processEntities: { maxTotalExpansions: 2_000_000 },
    isArray: (name) => ['property', 'image', 'feature', 'tag'].includes(name),
  });

  async validateCredentials(credentials: FeedCredentials): Promise<FeedValidationResult> {
    if (!credentials.endpoint) {
      return { valid: false, error: 'Kyero: feed URL is required' };
    }
    return probeXml(credentials.endpoint, ['<kyero', '<property'], 'Kyero');
  }

  async fetchProperties(
    credentials: FeedCredentials,
    page: number = 1,
    limit: number = 100,
  ): Promise<FeedImportResult> {
    const url = credentials.endpoint;
    if (!url) {
      throw new Error('Kyero: feed URL is required');
    }
    // Downloaded and mapped once per run; later pages reuse it (xml-feed.ts).
    const { items, totalCount, hasMore } = await loadXmlFeedPage(url, page, limit, (xml) => {
      const parsed = this.parser.parse(xml);
      const list: any[] = parsed?.root?.property ?? parsed?.property ?? [];
      return list.filter((raw) => raw?.id).map((raw) => this.mapProperty(raw));
    });
    return { properties: items, totalCount, hasMore, page };
  }

  private mapProperty(raw: any): FeedProperty {
    const id = String(raw.id);
    const price = toNumber(raw.price);
    const freq = String(raw.price_freq ?? 'sale').toLowerCase();
    const rental = freq === 'week' || freq === 'month';
    const town = this.text(raw.town);
    const type = this.text(raw.type) ?? 'Unknown';
    const sizes = raw.surface_area ?? {};
    const { names, categories, urbanization: featUrb, builtYear } = this.mapFeatures(raw);
    // location_detail is a village or urbanisation; some feeds repeat the town.
    const detail = this.text(raw.location_detail);
    const urbanization =
      featUrb ?? (detail && detail.toLowerCase() !== town?.toLowerCase() ? detail : undefined);

    return {
      externalId: id,
      reference: this.text(raw.ref) ?? id,
      title: raw.title ? cleanMultilingual(this.extractMultilingual(raw.title)) : this.defaultTitle(type, town),
      description: cleanMultilingual(this.extractMultilingual(raw.desc ?? {})),
      listingType: rental ? 'rent' : raw.new_build === '1' ? 'development' : 'sale',
      propertyType: type,
      price: price && price > 0 ? price : null,
      priceOnRequest: !price,
      ...(rental ? { rentalPeriod: freq as 'week' | 'month' } : {}),
      currency: String(raw.currency || 'EUR').toUpperCase(),
      bedrooms: toNumber(raw.beds),
      bathrooms: toNumber(raw.baths),
      buildSize: this.positive(sizes.built),
      plotSize: this.positive(sizes.plot),
      images: this.mapImages(raw.images),
      features: names,
      featureCategories: categories,
      location: {
        name: urbanization ?? town ?? '',
        province: this.text(raw.province),
        municipality: town,
        town,
        urbanization,
        country: this.text(raw.country) ?? 'Spain',
      },
      lat: toNumber(raw.location?.latitude ?? raw.latitude),
      lng: toNumber(raw.location?.longitude ?? raw.longitude),
      videoUrl: this.url(raw.video_url),
      virtualTourUrl: this.url(raw.virtual_tour_url),
      builtYear,
      energyRating: toEnergyRating(raw.energy_rating?.consumption),
    };
  }

  // The spec has no <title>; "Villa in Moraira" until the AI/merge flow fills
  // the other languages.
  private defaultTitle(type: string, town?: string): Record<string, string> {
    const name = type.charAt(0).toUpperCase() + type.slice(1);
    return { en: town ? `${name} in ${town}` : name };
  }

  // Free-text features. Some generators pack structured data in here
  // ("urbanization: Canor", "construction year: 2016"); those become fields.
  private mapFeatures(raw: any): {
    names: string[];
    categories: Record<string, string>;
    urbanization?: string;
    builtYear?: number;
  } {
    const names: string[] = [];
    const categories: Record<string, string> = {};
    let urbanization: string | undefined;
    let builtYear: number | undefined;
    for (const f of raw.features?.feature ?? []) {
      const name = this.text(f);
      if (!name) continue;
      const urb = name.match(/^urbani[sz]ation:\s*(.+)$/i);
      if (urb) {
        urbanization ??= urb[1].trim();
        continue;
      }
      const year = name.match(/^construction year:\s*(\d{4})$/i);
      if (year) {
        builtYear ??= Number(year[1]);
        continue;
      }
      if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    }
    if (raw.pool === '1' && !names.some((n) => n.toLowerCase().endsWith('pool'))) {
      names.push('Pool');
      categories['pool'] = 'community';
    }
    return { names, categories, urbanization, builtYear };
  }

  // Photos in feed order; floor plans go after the photos so the first image
  // on a card is never a plan.
  private mapImages(images: any): FeedPropertyImage[] {
    const list: any[] = images?.image ?? [];
    const photos: FeedPropertyImage[] = [];
    const plans: FeedPropertyImage[] = [];
    list.forEach((img, index) => {
      const url = this.url(img?.url);
      if (!url) return;
      const isPlan = (img.tags?.tag ?? []).some((t: unknown) => String(t).toLowerCase() === 'floorplan');
      (isPlan ? plans : photos).push({
        url,
        order: toNumber(img['@_id']) ?? index,
        ...(isPlan ? { alt: 'Floor plan' } : {}),
      });
    });
    return [...photos, ...plans].map((img, i) => ({ ...img, order: i }));
  }

  private text(value: unknown): string | undefined {
    if (value == null || typeof value === 'object') return undefined;
    const s = String(value).trim();
    return s ? s : undefined;
  }

  private positive(value: unknown): number | undefined {
    const n = toNumber(value);
    return n && n > 0 ? n : undefined;
  }

  private url(value: unknown): string | undefined {
    const s = this.text(value);
    return s && /^https?:\/\//i.test(s) ? s : undefined;
  }
}
