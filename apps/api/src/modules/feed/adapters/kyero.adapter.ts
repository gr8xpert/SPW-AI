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
import { loadXmlFeedPage, probeXml, toEnergyRating, toNumber } from './xml-feed';

// Kyero XML feed adapter. Reads the standard Kyero feed format
// (https://www.kyero.com/en/feeds) which most Spanish real-estate
// providers expose. Per-tenant: each client enters their feed URL in
// credentials.endpoint. No auth header — Kyero feeds are typically
// public URLs (the obscure URL itself is the credential).
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
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    isArray: (name) => ['property', 'image', 'feature'].includes(name),
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
      const root =
        parsed?.root?.kyero ?? parsed?.kyero ?? parsed?.root ?? parsed;
      const propsContainer = root?.properties ?? root;
      const rawProperties: any[] = Array.isArray(propsContainer?.property)
        ? propsContainer.property
        : propsContainer?.property
          ? [propsContainer.property]
          : [];
      return rawProperties.map((raw) => this.mapProperty(raw));
    });

    return { properties: items, totalCount, hasMore, page };
  }

  private mapProperty(raw: any): FeedProperty {
    const id = String(raw.id ?? raw.ref ?? '');
    const reference = String(raw.ref ?? raw.id ?? id);

    return {
      externalId: id,
      reference,
      agentReference: raw.agent_ref ? String(raw.agent_ref) : undefined,
      title: this.extractMultilingual(raw.title ?? raw.type ?? {}),
      description: this.extractMultilingual(raw.desc ?? raw.description ?? {}),
      listingType: this.normalizeListingType(this.extractListingType(raw)),
      propertyType: this.extractPropertyType(raw),
      price: toNumber(raw.price) ?? null,
      priceOnRequest: !raw.price || raw.price === '0',
      // Kyero price_freq: "sale", "month" or "week" (rentals).
      ...(raw.price_freq === 'week' || raw.price_freq === 'month' ? { rentalPeriod: raw.price_freq } : {}),
      currency: String(raw.currency ?? 'EUR').toUpperCase(),
      bedrooms: toNumber(raw.beds),
      bathrooms: toNumber(raw.baths),
      buildSize: toNumber(raw.surface_area?.built),
      plotSize: toNumber(raw.surface_area?.plot),
      terraceSize: toNumber(raw.surface_area?.terrace),
      gardenSize: undefined,
      images: this.mapImages(raw.images),
      features: this.mapFeatures(raw.features),
      location: {
        name: String(raw.location_detail ?? raw.town ?? ''),
        province: raw.province ? String(raw.province) : undefined,
        municipality: raw.municipality ? String(raw.municipality) : undefined,
        town: raw.town ? String(raw.town) : undefined,
        country: raw.country ? String(raw.country) : 'Spain',
      },
      lat: toNumber(raw.latitude),
      lng: toNumber(raw.longitude),
      videoUrl: raw.video?.url ? String(raw.video.url) : undefined,
      virtualTourUrl: raw.virtual_tour ? String(raw.virtual_tour) : undefined,
      deliveryDate: raw.delivery_date ? String(raw.delivery_date) : undefined,
      energyRating: toEnergyRating(raw.energy_rating?.consumption ?? raw.energy_rating),
    };
  }

  private extractListingType(raw: any): string {
    if (raw.new_build === 1 || raw.new_build === '1') return 'development';
    if (raw.holiday_rent === 1 || raw.holiday_rent === '1') return 'holiday_rent';
    if (raw.rent === 1 || raw.rent === '1' || raw.long_term_rent === 1) return 'rent';
    if (raw.type?.en) {
      const t = String(raw.type.en).toLowerCase();
      if (t.includes('rental') || t.includes('rent')) return 'rent';
    }
    return 'sale';
  }

  private extractPropertyType(raw: any): string {
    if (typeof raw.type === 'string') return raw.type;
    if (raw.type?.en) return String(raw.type.en);
    if (raw.type?.es) return String(raw.type.es);
    if (raw.property_type) return String(raw.property_type);
    return 'Unknown';
  }

  private mapImages(images: any): FeedPropertyImage[] {
    if (!images) return [];
    const list: any[] = Array.isArray(images.image)
      ? images.image
      : images.image
        ? [images.image]
        : Array.isArray(images)
          ? images
          : [];
    const result: FeedPropertyImage[] = [];
    list.forEach((img, index) => {
      const url =
        typeof img === 'string'
          ? img
          : img?.url ?? img?.['#text'] ?? img?.src ?? null;
      if (!url) return;
      const out: FeedPropertyImage = {
        url: String(url),
        order: img?.['@_id'] ? Number(img['@_id']) : index,
      };
      if (img?.['@_alt']) out.alt = String(img['@_alt']);
      result.push(out);
    });
    return result;
  }

  private mapFeatures(features: any): string[] {
    if (!features) return [];
    const list = Array.isArray(features.feature)
      ? features.feature
      : features.feature
        ? [features.feature]
        : Array.isArray(features)
          ? features
          : [];
    return list
      .map((f: any) =>
        typeof f === 'string' ? f : f?.['#text'] ?? f?.name ?? null,
      )
      .filter((x: any): x is string => typeof x === 'string' && x.length > 0);
  }
}
