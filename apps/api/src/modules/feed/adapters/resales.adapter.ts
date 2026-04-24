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

@Injectable()
export class ResalesAdapter extends BaseFeedAdapter {
  readonly provider = 'resales';
  readonly displayName = 'Resales Online';

  private readonly logger = new Logger(ResalesAdapter.name);
  private readonly baseUrl = 'https://webapi.resales-online.com/V6';
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  async validateCredentials(credentials: FeedCredentials): Promise<FeedValidationResult> {
    try {
      const response = await axios.get(`${this.baseUrl}/SearchProperties`, {
        params: {
          p_agency_filterid: credentials.clientId,
          p1: 1,
          p2: 1,
          ...this.getAuthParams(credentials),
        },
        timeout: 10000,
      });

      const data = typeof response.data === 'string'
        ? this.parser.parse(response.data)
        : response.data;

      if (data?.transaction?.status === 'error') {
        const desc = data.transaction.errordescription || {};
        const messages = Object.values(desc).filter(Boolean).join('; ');
        return { valid: false, error: messages || 'Resales Online returned an error' };
      }

      return { valid: true };
    } catch (error: any) {
      this.logger.error('Resales credential validation failed', error);

      if (error.response?.data) {
        const raw = error.response.data;
        const body = typeof raw === 'string'
          ? (() => { try { return this.parser.parse(raw); } catch { try { return JSON.parse(raw); } catch { return null; } } })()
          : raw;

        const desc = body?.root?.transaction?.errordescription || body?.transaction?.errordescription;
        if (desc) {
          const messages = Object.values(desc).filter(Boolean).join('; ');
          return { valid: false, error: messages };
        }
      }

      return { valid: false, error: 'Could not connect to Resales Online. Check your API key and client ID.' };
    }
  }

  async fetchProperties(
    credentials: FeedCredentials,
    page: number = 1,
    limit: number = 100,
  ): Promise<FeedImportResult> {
    const startIndex = (page - 1) * limit + 1;
    const endIndex = startIndex + limit - 1;

    const response = await axios.get(`${this.baseUrl}/SearchProperties`, {
      params: {
        p_agency_filterid: credentials.clientId,
        p1: startIndex,
        p2: endIndex,
        ...this.getAuthParams(credentials),
      },
      timeout: 60000,
    });

    const data = this.parser.parse(response.data);
    const root = data.root || data;

    const queryInfo = root.QueryInfo || {};
    const totalCount = parseInt(queryInfo.PropertyCount || '0', 10);

    const rawProperties = root.Property || [];
    const propertyArray = Array.isArray(rawProperties) ? rawProperties : [rawProperties];

    const properties = propertyArray
      .filter((p: any) => p && p.Reference)
      .map((p: any) => this.mapProperty(p));

    return {
      properties,
      totalCount,
      hasMore: endIndex < totalCount,
      page,
    };
  }

  private getAuthParams(credentials: FeedCredentials): Record<string, string> {
    const params: Record<string, string> = {};
    if (credentials.apiKey) {
      params['p_apikey'] = credentials.apiKey;
    }
    return params;
  }

  private mapProperty(raw: any): FeedProperty {
    return {
      externalId: String(raw.Reference || ''),
      reference: String(raw.Reference || ''),
      agentReference: raw.AgentRef || null,
      title: this.extractMultilingual(raw.PropertyTitle),
      description: this.extractMultilingual(raw.Description),
      listingType: this.normalizeListingType(raw.Transaction || 'sale'),
      propertyType: raw.PropertyType?.TypeName || 'Unknown',
      price: this.parsePrice(raw.Price),
      priceOnRequest: raw.Price === 'POA' || raw.PriceOnApplication === 'Yes',
      currency: raw.Currency || 'EUR',
      bedrooms: this.parseInt(raw.Bedrooms),
      bathrooms: this.parseInt(raw.Bathrooms),
      buildSize: this.parseFloat(raw.Built),
      plotSize: this.parseFloat(raw.Plot),
      terraceSize: this.parseFloat(raw.Terrace),
      gardenSize: this.parseFloat(raw.Garden),
      images: this.mapImages(raw.Pictures?.Picture),
      features: this.mapFeatures(raw.Features?.Feature),
      location: {
        name: raw.Location?.LocationName || '',
        province: raw.Location?.Province || '',
        municipality: raw.Location?.Municipality || '',
        town: raw.Location?.Town || '',
        country: raw.Location?.Country || 'Spain',
        externalId: raw.Location?.LocationId || '',
      },
      lat: this.parseFloat(raw.Latitude),
      lng: this.parseFloat(raw.Longitude),
      videoUrl: raw.VideoURL || null,
      virtualTourUrl: raw.VirtualTourURL || null,
    };
  }

  private mapImages(pictures: any): FeedPropertyImage[] {
    if (!pictures) return [];

    const pictureArray = Array.isArray(pictures) ? pictures : [pictures];

    return pictureArray
      .filter((p: any) => p && p.PictureURL)
      .map((p: any, index: number) => ({
        url: p.PictureURL,
        order: index,
        alt: p.PictureCaption || '',
      }));
  }

  private mapFeatures(features: any): string[] {
    if (!features) return [];

    const featureArray = Array.isArray(features) ? features : [features];

    return featureArray
      .filter((f: any) => f && f.FeatureName)
      .map((f: any) => f.FeatureName);
  }

  private parsePrice(value: any): number | null {
    if (value === null || value === undefined || value === 'POA') {
      return null;
    }

    const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? null : parsed;
  }

  private parseInt(value: any): number | undefined {
    if (value === null || value === undefined) return undefined;
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? undefined : parsed;
  }

  private parseFloat(value: any): number | undefined {
    if (value === null || value === undefined) return undefined;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? undefined : parsed;
  }
}
