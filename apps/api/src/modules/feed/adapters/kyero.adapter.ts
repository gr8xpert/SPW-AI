import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import {
  BaseFeedAdapter,
  FeedProperty,
  FeedImportResult,
  FeedPropertyImage,
  FeedValidationResult,
} from './base.adapter';
import { FeedCredentials } from '../../../database/entities/feed-config.entity';

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

  private readonly logger = new Logger(KyeroAdapter.name);

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    isArray: (name) => ['property', 'image', 'feature'].includes(name),
  });

  async validateCredentials(credentials: FeedCredentials): Promise<FeedValidationResult> {
    const url = credentials.endpoint;
    if (!url) {
      return { valid: false, error: 'Kyero: feed URL is required' };
    }
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        // Kyero feeds can be huge; HEAD often works to validate.
        responseType: 'text',
        maxContentLength: 50 * 1024 * 1024,
      });
      if (response.status !== 200) {
        return { valid: false, error: `Kyero: HTTP ${response.status}` };
      }
      const body = String(response.data ?? '').slice(0, 4096);
      if (!body.includes('<kyero') && !body.includes('<property')) {
        return { valid: false, error: 'Kyero: response is not a Kyero XML feed' };
      }
      return { valid: true };
    } catch (error: any) {
      this.logger.error('Kyero credential validation failed', error);
      const msg = error.response?.status
        ? `HTTP ${error.response.status}`
        : error.message || 'Connection failed';
      return { valid: false, error: `Kyero: ${msg}` };
    }
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

    const response = await axios.get(url, {
      timeout: 120000,
      responseType: 'text',
      maxContentLength: 200 * 1024 * 1024,
    });

    const parsed = this.parser.parse(String(response.data));
    const root =
      parsed?.root?.kyero ?? parsed?.kyero ?? parsed?.root ?? parsed;
    const propsContainer = root?.properties ?? root;
    const rawProperties: any[] = Array.isArray(propsContainer?.property)
      ? propsContainer.property
      : propsContainer?.property
        ? [propsContainer.property]
        : [];

    const totalCount = rawProperties.length;
    const start = (page - 1) * limit;
    const sliced = rawProperties.slice(start, start + limit);

    const properties = sliced.map((raw) => this.mapProperty(raw));

    return {
      properties,
      totalCount,
      hasMore: start + limit < totalCount,
      page,
    };
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
      price: this.parseNumber(raw.price) ?? null,
      priceOnRequest: !raw.price || raw.price === '0',
      currency: String(raw.currency ?? 'EUR').toUpperCase(),
      bedrooms: this.parseNumber(raw.beds),
      bathrooms: this.parseNumber(raw.baths),
      buildSize: this.parseNumber(raw.surface_area?.built),
      plotSize: this.parseNumber(raw.surface_area?.plot),
      terraceSize: this.parseNumber(raw.surface_area?.terrace),
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
      lat: this.parseNumber(raw.latitude),
      lng: this.parseNumber(raw.longitude),
      videoUrl: raw.video?.url ? String(raw.video.url) : undefined,
      virtualTourUrl: raw.virtual_tour ? String(raw.virtual_tour) : undefined,
      deliveryDate: raw.delivery_date ? String(raw.delivery_date) : undefined,
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

  private parseNumber(value: unknown): number | undefined {
    if (value == null || value === '') return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
}
