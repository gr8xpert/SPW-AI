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

// Odoo CRM property feed adapter. Per-tenant: each client provides a URL
// + bearer token in credentials (endpoint + apiKey). Format auto-detects
// between JSON and XML responses so the same adapter handles both Odoo
// custom REST endpoints and Odoo XML exports.
//
// Field mapping is permissive: tries multiple common field names for each
// FeedProperty attribute since real-estate Odoo modules vary widely
// (Odoo Enterprise estate module, third-party odoo-real-estate addons,
// or custom x_ fields on crm.lead). Once a sample feed is supplied, the
// mapping can be tightened or moved to FeedFieldMapping per tenant.
//
// Image policy (Task #4): URLs are kept as-is — we don't re-host feed
// images, only client-uploaded ones go to R2.
@Injectable()
export class OdooAdapter extends BaseFeedAdapter {
  readonly provider = 'odoo';
  readonly displayName = 'Odoo CRM';

  private readonly logger = new Logger(OdooAdapter.name);

  private readonly xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: true,
    parseTagValue: true,
    trimValues: true,
    isArray: (name) => ['property', 'image', 'feature', 'item', 'record'].includes(name),
  });

  async validateCredentials(credentials: FeedCredentials): Promise<FeedValidationResult> {
    const url = credentials.endpoint;
    const token = credentials.apiKey;
    if (!url) {
      return { valid: false, error: 'Odoo: endpoint URL is required' };
    }
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: this.headers(token),
        responseType: 'text',
        maxContentLength: 50 * 1024 * 1024,
      });
      if (response.status !== 200) {
        return { valid: false, error: `Odoo: HTTP ${response.status}` };
      }
      return { valid: true };
    } catch (error: any) {
      this.logger.error('Odoo credential validation failed', error);
      const msg = error.response?.status
        ? `HTTP ${error.response.status}`
        : error.message || 'Connection failed';
      return { valid: false, error: `Odoo: ${msg}` };
    }
  }

  async fetchProperties(
    credentials: FeedCredentials,
    page: number = 1,
    limit: number = 100,
  ): Promise<FeedImportResult> {
    const url = credentials.endpoint;
    const token = credentials.apiKey;
    if (!url) {
      throw new Error('Odoo: endpoint URL is required');
    }

    const response = await axios.get(url, {
      timeout: 120000,
      headers: this.headers(token),
      responseType: 'text',
      maxContentLength: 200 * 1024 * 1024,
    });

    const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
    const body = String(response.data ?? '');
    const rawProperties = this.extractProperties(body, contentType);

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

  private headers(token: string | undefined): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json, application/xml' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  private extractProperties(body: string, contentType: string): any[] {
    const trimmed = body.trim();
    const looksJson =
      contentType.includes('json') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[');

    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.data)) return parsed.data;
        if (Array.isArray(parsed?.properties)) return parsed.properties;
        if (Array.isArray(parsed?.records)) return parsed.records;
        if (Array.isArray(parsed?.result)) return parsed.result;
        if (parsed?.result?.records) return parsed.result.records;
        return [];
      } catch (err) {
        this.logger.warn(`Odoo: response looked like JSON but failed to parse — ${(err as Error).message}`);
        return [];
      }
    }

    const parsed = this.xmlParser.parse(trimmed);
    const candidates = [
      parsed?.properties?.property,
      parsed?.root?.properties?.property,
      parsed?.records?.record,
      parsed?.root?.record,
      parsed?.data?.item,
      parsed?.items?.item,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) return c;
      if (c) return [c];
    }
    return [];
  }

  private mapProperty(raw: any): FeedProperty {
    const id = String(raw.id ?? raw.external_id ?? raw.ref ?? raw.code ?? '');
    const reference = String(raw.ref ?? raw.reference ?? raw.code ?? id);

    return {
      externalId: id,
      reference,
      agentReference: raw.agent_ref ? String(raw.agent_ref) : undefined,
      title: this.extractMultilingual(raw.title ?? raw.name ?? raw.type ?? {}),
      description: this.extractMultilingual(raw.description ?? raw.desc ?? {}),
      listingType: this.normalizeListingType(
        String(raw.listing_type ?? raw.operation ?? raw.x_listing_type ?? 'sale'),
      ),
      propertyType: this.extractPropertyType(raw),
      price: this.parseNumber(raw.price ?? raw.expected_price ?? raw.list_price) ?? null,
      priceOnRequest: raw.price_on_request === true || raw.price_on_request === 1,
      currency: String(raw.currency ?? raw.currency_id?.name ?? 'EUR').toUpperCase(),
      bedrooms: this.parseNumber(raw.bedrooms ?? raw.beds ?? raw.x_bedrooms),
      bathrooms: this.parseNumber(raw.bathrooms ?? raw.baths ?? raw.x_bathrooms),
      buildSize: this.parseNumber(raw.build_size ?? raw.built_area ?? raw.x_built_area),
      plotSize: this.parseNumber(raw.plot_size ?? raw.plot_area ?? raw.x_plot_area),
      terraceSize: this.parseNumber(raw.terrace_size ?? raw.x_terrace_area),
      gardenSize: this.parseNumber(raw.garden_size ?? raw.x_garden_area),
      images: this.mapImages(raw.images ?? raw.photos ?? raw.image_urls),
      features: this.mapFeatures(raw.features ?? raw.amenities ?? raw.tags),
      location: {
        name: String(
          raw.location?.name ?? raw.address ?? raw.city ?? raw.town ?? '',
        ),
        province: raw.province ?? raw.location?.province,
        municipality: raw.municipality ?? raw.location?.municipality,
        town: raw.town ?? raw.city ?? raw.location?.town,
        country: raw.country ?? raw.location?.country ?? 'Spain',
        externalId: raw.location_id ? String(raw.location_id) : undefined,
      },
      lat: this.parseNumber(raw.latitude ?? raw.lat ?? raw.location?.lat),
      lng: this.parseNumber(raw.longitude ?? raw.lng ?? raw.location?.lng),
      videoUrl: raw.video_url ? String(raw.video_url) : undefined,
      virtualTourUrl: raw.virtual_tour_url ? String(raw.virtual_tour_url) : undefined,
      deliveryDate: raw.delivery_date ? String(raw.delivery_date) : undefined,
    };
  }

  private extractPropertyType(raw: any): string {
    if (typeof raw.type === 'string') return raw.type;
    if (typeof raw.property_type === 'string') return raw.property_type;
    if (raw.property_type?.name) return String(raw.property_type.name);
    if (raw.type?.name) return String(raw.type.name);
    if (raw.x_property_type) return String(raw.x_property_type);
    return 'Unknown';
  }

  private mapImages(images: any): FeedPropertyImage[] {
    if (!images) return [];
    const list: any[] = Array.isArray(images)
      ? images
      : Array.isArray(images.image)
        ? images.image
        : images.image
          ? [images.image]
          : [];
    const result: FeedPropertyImage[] = [];
    list.forEach((img, index) => {
      const url =
        typeof img === 'string'
          ? img
          : img?.url ?? img?.src ?? img?.['#text'] ?? null;
      if (!url) return;
      const out: FeedPropertyImage = {
        url: String(url),
        order: Number(img?.order ?? img?.['@_order'] ?? index),
      };
      const alt = img?.alt ?? img?.caption;
      if (alt) out.alt = String(alt);
      result.push(out);
    });
    return result;
  }

  private mapFeatures(features: any): string[] {
    if (!features) return [];
    const list = Array.isArray(features)
      ? features
      : Array.isArray(features.feature)
        ? features.feature
        : [];
    return list
      .map((f: any) =>
        typeof f === 'string' ? f : f?.name ?? f?.label ?? f?.['#text'] ?? null,
      )
      .filter((x: any): x is string => typeof x === 'string' && x.length > 0);
  }

  private parseNumber(value: unknown): number | undefined {
    if (value == null || value === '') return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
}
