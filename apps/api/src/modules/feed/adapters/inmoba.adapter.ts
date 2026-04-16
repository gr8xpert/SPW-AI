import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  BaseFeedAdapter,
  FeedProperty,
  FeedImportResult,
  FeedPropertyImage,
} from './base.adapter';
import { FeedCredentials } from '../../../database/entities/feed-config.entity';

@Injectable()
export class InmobaAdapter extends BaseFeedAdapter {
  readonly provider = 'inmoba';
  readonly displayName = 'Inmoba';

  private readonly logger = new Logger(InmobaAdapter.name);

  async validateCredentials(credentials: FeedCredentials): Promise<boolean> {
    try {
      const endpoint = credentials.endpoint || 'https://api.inmoba.com/v1';

      const response = await axios.get(`${endpoint}/properties`, {
        params: { limit: 1 },
        headers: this.getHeaders(credentials),
        timeout: 10000,
      });

      return response.status === 200;
    } catch (error) {
      this.logger.error('Inmoba credential validation failed', error);
      return false;
    }
  }

  async fetchProperties(
    credentials: FeedCredentials,
    page: number = 1,
    limit: number = 100,
  ): Promise<FeedImportResult> {
    const endpoint = credentials.endpoint || 'https://api.inmoba.com/v1';

    const response = await axios.get(`${endpoint}/properties`, {
      params: {
        page,
        limit,
      },
      headers: this.getHeaders(credentials),
      timeout: 60000,
    });

    const data = response.data;
    const properties = (data.data || data.properties || []).map((p: any) =>
      this.mapProperty(p),
    );

    const totalCount = data.meta?.total || data.total || properties.length;

    return {
      properties,
      totalCount,
      hasMore: page * limit < totalCount,
      page,
    };
  }

  private getHeaders(credentials: FeedCredentials): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${credentials.apiKey}`,
      'X-Client-ID': credentials.clientId || '',
    };
  }

  private mapProperty(raw: any): FeedProperty {
    return {
      externalId: String(raw.id || raw.reference || ''),
      reference: String(raw.reference || raw.id || ''),
      agentReference: raw.agent_reference || null,
      title: this.extractTitle(raw),
      description: this.extractDescription(raw),
      listingType: this.normalizeListingType(raw.operation || raw.listing_type || 'sale'),
      propertyType: raw.property_type?.name || raw.type || 'Unknown',
      price: raw.price || null,
      priceOnRequest: raw.price_on_request || false,
      currency: raw.currency || 'EUR',
      bedrooms: raw.bedrooms || raw.rooms,
      bathrooms: raw.bathrooms,
      buildSize: raw.built_area || raw.build_size,
      plotSize: raw.plot_area || raw.plot_size,
      terraceSize: raw.terrace_area,
      gardenSize: raw.garden_area,
      images: this.mapImages(raw.images || raw.photos),
      features: this.mapFeatures(raw.features || raw.amenities),
      location: {
        name: raw.location?.name || raw.city || '',
        province: raw.location?.province || raw.province || '',
        municipality: raw.location?.municipality || '',
        town: raw.location?.town || raw.town || '',
        country: raw.location?.country || 'Spain',
        externalId: raw.location?.id || '',
      },
      lat: raw.latitude || raw.location?.lat,
      lng: raw.longitude || raw.location?.lng,
      videoUrl: raw.video_url,
      virtualTourUrl: raw.virtual_tour_url,
      deliveryDate: raw.delivery_date,
    };
  }

  private extractTitle(raw: any): Record<string, string> {
    if (raw.title) {
      return this.extractMultilingual(raw.title);
    }

    if (raw.titles) {
      return raw.titles;
    }

    return { en: raw.name || '' };
  }

  private extractDescription(raw: any): Record<string, string> {
    if (raw.description) {
      return this.extractMultilingual(raw.description);
    }

    if (raw.descriptions) {
      return raw.descriptions;
    }

    return { en: '' };
  }

  private mapImages(images: any): FeedPropertyImage[] {
    if (!images) return [];

    const imageArray = Array.isArray(images) ? images : [images];

    return imageArray
      .filter((img: any) => img)
      .map((img: any, index: number) => ({
        url: typeof img === 'string' ? img : img.url || img.src,
        order: img.order ?? index,
        alt: img.alt || img.caption || '',
      }));
  }

  private mapFeatures(features: any): string[] {
    if (!features) return [];

    if (Array.isArray(features)) {
      return features.map((f: any) =>
        typeof f === 'string' ? f : f.name || f.label,
      );
    }

    return [];
  }
}
