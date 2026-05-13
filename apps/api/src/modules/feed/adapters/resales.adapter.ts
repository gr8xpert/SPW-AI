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
    if (!credentials.clientId || !credentials.apiKey || !credentials.filterId) {
      return { valid: false, error: 'Resales Online requires Client ID, API Key, and Filter ID.' };
    }
    try {
      const response = await axios.get(`${this.baseUrl}/SearchProperties`, {
        params: {
          ...this.getAuthParams(credentials),
          P_PageNo: 1,
          P_PageSize: 1,
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
    if (!credentials.clientId || !credentials.apiKey || !credentials.filterId) {
      throw new Error('Resales Online requires Client ID, API Key, and Filter ID.');
    }

    const response = await axios.get(`${this.baseUrl}/SearchProperties`, {
      params: {
        ...this.getAuthParams(credentials),
        P_PageNo: page,
        P_PageSize: limit,
      },
      timeout: 60000,
    });

    const data = typeof response.data === 'string'
      ? this.parser.parse(response.data)
      : response.data;
    const root = data.root || data;

    if (root?.transaction?.status === 'error') {
      const desc = root.transaction.errordescription || {};
      const messages = Object.values(desc).filter(Boolean).join('; ');
      throw new Error(`Resales Online: ${messages || 'unknown error'}`);
    }

    const queryInfo = root.QueryInfo || {};
    const totalCount = parseInt(String(queryInfo.PropertyCount || '0'), 10);
    const searchType = String(queryInfo.SearchType || 'Sale');

    const rawProperties = root.Property || [];
    const propertyArray = Array.isArray(rawProperties) ? rawProperties : [rawProperties];
    const validProperties = propertyArray.filter((p: any) => p && p.Reference);

    // Enrich each property with PropertyDetails (financial fields not in list view)
    const CONCURRENCY = 5;
    const enriched: FeedProperty[] = [];
    for (let i = 0; i < validProperties.length; i += CONCURRENCY) {
      const batch = validProperties.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((p: any) => this.fetchPropertyDetailsAndMerge(credentials, p, searchType)),
      );
      enriched.push(...batchResults);
    }

    return {
      properties: enriched,
      totalCount,
      hasMore: page * limit < totalCount,
      page,
    };
  }

  private async fetchPropertyDetailsAndMerge(
    credentials: FeedCredentials,
    listProperty: any,
    searchType: string,
  ): Promise<FeedProperty> {
    try {
      const response = await axios.get(`${this.baseUrl}/PropertyDetails`, {
        params: {
          ...this.getAuthParams(credentials),
          P_RefId: listProperty.Reference,
          P_Lang: 'EN',
          P_Dimension: 1,
        },
        timeout: 15000,
      });

      const data = typeof response.data === 'string'
        ? this.parser.parse(response.data)
        : response.data;
      const root = data.root || data;
      const detailRaw = Array.isArray(root.Property) ? root.Property[0] : root.Property;

      if (detailRaw && root?.transaction?.status !== 'error') {
        const merged = { ...listProperty, ...detailRaw };
        return this.mapProperty(merged, searchType);
      }
    } catch (err: any) {
      this.logger.warn(
        `PropertyDetails failed for ${listProperty.Reference}: ${err?.message || err}`,
      );
    }

    return this.mapProperty(listProperty, searchType);
  }

  private getAuthParams(credentials: FeedCredentials): Record<string, string> {
    return {
      p_agency_filterid: credentials.filterId || '',
      p1: credentials.clientId || '',
      p2: credentials.apiKey || '',
    };
  }

  private mapProperty(raw: any, searchType: string = 'Sale'): FeedProperty {
    // Use NameType (the specific subtype like "Detached Villa") rather than Type.
    // Users group these manually under custom parent types in the dashboard.
    const propertyTypeName = raw.PropertyType?.NameType || raw.PropertyType?.Type || 'Unknown';

    // SearchProperties returns Location/SubLocation as siblings at root; PropertyDetails nests them
    // inside a Location object. After the list+detail merge we may have either form, so read both.
    const locObj = (raw.Location && typeof raw.Location === 'object') ? raw.Location : null;
    const locationName = locObj?.LocationName || (typeof raw.Location === 'string' ? raw.Location : '');
    const subLocation = locObj?.SubLocation || raw.SubLocation || '';
    const province = locObj?.Province || raw.Province || '';
    const area = locObj?.Area || raw.Area || '';
    const country = locObj?.Country || raw.Country || 'Spain';
    const locationExternalId = locObj?.LocationId || raw.LocationId || '';

    const titleText = locationName ? `${propertyTypeName} in ${locationName}` : propertyTypeName;
    const { names: featureNames, categories: featureCategories } = this.mapFeatures(raw.PropertyFeatures?.Category);

    return {
      externalId: String(raw.Reference || ''),
      reference: String(raw.Reference || ''),
      agentReference: raw.AgencyRef || raw.AgentRef || null,
      title: { en: titleText },
      description: this.extractMultilingual(raw.Description),
      listingType: this.mapResalesListingType(searchType),
      propertyType: propertyTypeName,
      price: this.parsePrice(raw.Price),
      priceOnRequest: raw.Price === 'POA' || raw.Price === '0' || raw.PriceOnApplication === 'Yes',
      currency: raw.Currency || 'EUR',
      bedrooms: this.parseInt(raw.Bedrooms),
      bathrooms: this.parseInt(raw.Bathrooms),
      buildSize: this.parseFloat(raw.Built ?? raw.BuiltArea),
      plotSize: this.parseFloat(raw.GardenPlot ?? raw.Plot),
      terraceSize: this.parseFloat(raw.Terrace),
      // raw.Garden is a boolean flag (has garden), not a size — skip
      images: this.mapImages(raw.Pictures?.Picture),
      features: featureNames,
      featureCategories,
      location: {
        // Resales sends 5 fields. Mapped to our 6-level hierarchy:
        //   Country     → context only (not a level)
        //   Province    → province       (e.g. Málaga)
        //   Area        → area           (e.g. Costa del Sol — coastal/comarca region)
        //   Location    → municipality   (e.g. Marbella — formal administrative municipio)
        //   SubLocation → town           (e.g. Nueva Andalucía — pueblo/neighborhood)
        // Region (e.g. Andalucía) and Urbanization are NOT in the feed.
        // AI enrichment fills Region after import from the province. Urbanization
        // is rare and added manually by clients when needed.
        name: locationName,
        province,
        area,
        municipality: locationName,
        town: subLocation,
        country,
        externalId: locationExternalId,
      },
      lat: this.parseFloat(raw.Latitude),
      lng: this.parseFloat(raw.Longitude),
      videoUrl: raw.VideoURL || null,
      virtualTourUrl: raw.VirtualTourURL || null,
      communityFees: this.toMonthly(raw.Community_Fees_Year ?? raw.CommunityFees),
      ibiFees: this.parseMoney(raw.IBI_Fees_Year ?? raw.IBI),
      basuraTax: this.parseMoney(raw.Basura_Tax_Year ?? raw.Basura),
      builtYear: this.parseInt(raw.BuiltYear),
    };
  }

  private parseMoney(value: any): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    // Strip currency symbols, thousand separators, etc. Keep digits, dot, minus.
    const cleaned = String(value).replace(/[^0-9.-]/g, '');
    if (!cleaned) return undefined;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? undefined : parsed;
  }

  private toMonthly(yearlyValue: any): number | undefined {
    const yearly = this.parseMoney(yearlyValue);
    if (yearly === undefined) return undefined;
    return Math.round((yearly / 12) * 100) / 100;
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

  private mapResalesListingType(searchType: string): 'sale' | 'rent' | 'holiday_rent' | 'development' {
    const t = searchType.toLowerCase();
    if (t.includes('short term')) return 'holiday_rent';
    if (t.includes('long term') || t.includes('rental') || t.includes('rent')) return 'rent';
    if (t.includes('new') || t.includes('development') || t.includes('obra')) return 'development';
    return 'sale';
  }

  // Maps Resales-Online category names to our internal feature categories.
  // Resales groups features under headings like "Setting", "Orientation", "Climate
  // Control", "Views", "Features" (interior), "Furniture", "Kitchen", "Garden",
  // "Pool", "Security", "Parking", "Utilities", "Category".
  private static readonly RESALES_CATEGORY_MAP: Record<string, string> = {
    setting: 'exterior',
    orientation: 'exterior',
    condition: 'other',
    'climate control': 'climate',
    climate: 'climate',
    views: 'views',
    features: 'interior',
    furniture: 'interior',
    kitchen: 'interior',
    garden: 'exterior',
    pool: 'community',
    security: 'security',
    parking: 'parking',
    utilities: 'other',
    category: 'other',
  };

  private mapFeatures(categories: any): { names: string[]; categories: Record<string, string> } {
    if (!categories) return { names: [], categories: {} };

    const categoryArray = Array.isArray(categories) ? categories : [categories];
    const names: string[] = [];
    const featureCategoryMap: Record<string, string> = {};

    for (const cat of categoryArray) {
      if (!cat) continue;
      const headingRaw = cat['@_Type'] ?? cat.Type ?? cat.CategoryName ?? cat.Name ?? '';
      const heading = String(headingRaw).toLowerCase().trim();
      const internalCategory = ResalesAdapter.RESALES_CATEGORY_MAP[heading] || 'other';

      const collect = (val: any) => {
        if (typeof val === 'string' && val.trim()) {
          const name = val.trim();
          names.push(name);
          featureCategoryMap[name.toLowerCase()] = internalCategory;
        }
      };

      const values = cat.Value;
      if (Array.isArray(values)) {
        for (const v of values) collect(v);
      } else if (typeof values === 'string') {
        collect(values);
      } else if (typeof cat.FeatureName === 'string') {
        collect(cat.FeatureName);
      }
    }

    return { names, categories: featureCategoryMap };
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
