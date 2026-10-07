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
  // Overridable for local end-to-end tests against a stand-in server; unset in
  // production.
  private readonly baseUrl = process.env.RESALES_API_BASE_URL || 'https://webapi.resales-online.com/V6';
  // SearchProperties never returns more than 40 per page, whatever P_PageSize
  // asks for (QueryInfo.PropertiesPerPage says 40).
  private static readonly MAX_PAGE_SIZE = 40;
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
        P_PageSize: Math.min(limit, ResalesAdapter.MAX_PAGE_SIZE),
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
    // Page through at the size the API actually used. Computing this from the
    // requested size stopped imports at 520 of 1227 (13 pages x 40).
    const perPage = parseInt(String(queryInfo.PropertiesPerPage || '0'), 10);

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
      hasMore: propertyArray.length > 0 && page * (perPage || propertyArray.length) < totalCount,
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
          // New Developments API: the units' price list, the development's
          // name, half baths (2.5) and the GPS the agent entered (own listings).
          p_pricelist: 'TRUE',
          P_shownewdevname: 'TRUE',
          P_DecimalBaths: 1,
          P_ShowGPSCoords: 'TRUE',
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
    // PropertyType: { NameType, Type, TypeId, Subtype1, SubtypeId1, Subtype2… }.
    // NameType is the subtype ("Detached Villa") except on development
    // listings, where Resales puts "New Development" there and the unit types
    // in Subtype1..n. The real type is Subtype1 (code SubtypeId1) in both cases.
    const pt = raw.PropertyType || {};
    const isNewDevelopment = this.isNewDevelopment(raw);
    const propertyTypeName =
      (isNewDevelopment ? pt.Subtype1 || pt.Type : pt.NameType || pt.Subtype1 || pt.Type) || 'Unknown';
    const propertyTypeCode = pt.SubtypeId1 ? String(pt.SubtypeId1) : undefined;

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
      listingType: isNewDevelopment ? 'development' : this.mapResalesListingType(searchType),
      propertyType: propertyTypeName,
      propertyTypeCode,
      propertyTypeGroup: pt.Type ? String(pt.Type) : undefined,
      propertyTypeGroupCode: pt.TypeId ? String(pt.TypeId) : undefined,
      ...this.mapPrice(raw),
      currency: raw.Currency || 'EUR',
      // "2", "2.5", or "1 - 3" on a development (low end, high end in *To).
      ...this.range('bedrooms', raw.Bedrooms, true),
      ...this.range('bathrooms', raw.Bathrooms),
      ...this.range('buildSize', raw.Built ?? raw.BuiltArea),
      ...this.range('plotSize', raw.GardenPlot ?? raw.Plot),
      ...this.range('terraceSize', raw.Terrace),
      // raw.Garden is a boolean flag (has garden), not a size — skip
      images: this.mapImages(raw.Pictures?.Picture),
      features: featureNames,
      featureCategories,
      location: {
        // Resales sends Country / Province / Area / Location / SubLocation.
        // Its "Location" is a town or district (Arroyo de la Miel, Benalmádena
        // Costa, Higuerón), not a municipality, and SubLocation sits below it.
        // The municipality level (and the region) comes from the platform
        // location template, which places each town under its municipality.
        name: locationName,
        province,
        area,
        town: locationName,
        urbanization: subLocation,
        country,
        externalId: locationExternalId,
      },
      ...this.mapGps(raw),
      // Resales spells this differently depending on the response; take any
      // of them rather than guess which one this account gets.
      // "OwnProperty": "1" on the agency's own stock, "0" on shared listings.
      isOwnProperty: this.truthy(raw.OwnProperty ?? raw.Own ?? raw.IsOwnProperty),
      postcode: this.text(
        raw.Zipcode ?? raw.ZipCode ?? raw.zipcode ?? raw.PostCode ??
        raw.Postcode ?? raw.PostalCode ?? raw.postal_code ?? raw.zip,
      ),
      videoUrl: raw.VideoURL || null,
      virtualTourUrl: raw.VirtualTourURL || null,
      communityFees: this.toMonthly(raw.Community_Fees_Year ?? raw.CommunityFees),
      ibiFees: this.parseMoney(raw.IBI_Fees_Year ?? raw.IBI),
      basuraTax: this.parseMoney(raw.Basura_Tax_Year ?? raw.Basura),
      builtYear: this.parseInt(raw.BuiltYear),
      energyRating: this.parseEnergyRating(raw.EnergyRating ?? raw.EnergyRatingConsumption),
      ...(isNewDevelopment ? this.mapDevelopment(raw) : {}),
    };
  }

  // "39 - 107" → { buildSize: 39, buildSizeTo: 107 }; "60" → { buildSize: 60 }.
  // The To end is kept only when higher.
  private range<K extends 'bedrooms' | 'bathrooms' | 'buildSize' | 'plotSize' | 'terraceSize'>(
    key: K,
    value: any,
    whole = false,
  ): Partial<FeedProperty> {
    if (value === null || value === undefined || value === '') return {};
    const [lowText, highText] = String(value).split(/\s*-\s*/);
    const parse = (v: string | undefined) => (whole ? this.parseInt(v) : this.parseFloat(v));
    const low = parse(lowText);
    const high = parse(highText);
    const out: Partial<FeedProperty> = { [key]: low };
    if (low !== undefined && high !== undefined && high > low) (out as any)[`${key}To`] = high;
    return out;
  }

  // NewDevName, KeyReady and PriceList (PropertyDetails with p_pricelist).
  // A unit: { Name, Type, Price, BuiltSize, Terrace, Beds, Baths, KeyReady,
  // StatusText, StatusCode }; sold units come with Price null.
  private mapDevelopment(raw: any): Pick<FeedProperty, 'developmentName' | 'keyReady' | 'units'> {
    const list = Array.isArray(raw.PriceList) ? raw.PriceList : raw.PriceList ? [raw.PriceList] : [];
    const units = list
      .filter((u: any) => u && typeof u === 'object')
      .map((u: any) => ({
        name: this.text(u.Name) || '',
        type: this.text(u.Type) || null,
        price: this.parsePrice(u.Price),
        builtSize: this.parseFloat(u.BuiltSize) ?? null,
        terraceSize: this.parseFloat(u.Terrace) ?? null,
        bedrooms: this.parseInt(u.Beds) ?? null,
        bathrooms: this.parseFloat(u.Baths) ?? null,
        keyReady: u.KeyReady == null || u.KeyReady === '' ? null : this.truthy(u.KeyReady) ?? null,
        status: String(u.StatusCode || u.StatusText || 'Available').trim().toLowerCase(),
      }));
    const keyReady = raw.KeyReady == null || raw.KeyReady === '' ? undefined : this.truthy(raw.KeyReady);
    return {
      developmentName: this.text(raw.NewDevName) || undefined,
      keyReady,
      units,
    };
  }

  // P_ShowGPSCoords: Latitude/Longitude on some responses, GpsX/GpsY on
  // others, which Resales doesn't document the order of. Spain's coordinates
  // tell them apart: latitude 27–44, longitude −19–5. 0/0 = not entered.
  private mapGps(raw: any): { lat?: number; lng?: number } {
    let lat = this.parseFloat(raw.Latitude ?? raw.GPS_Latitude);
    let lng = this.parseFloat(raw.Longitude ?? raw.GPS_Longitude);
    if (lat === undefined || lng === undefined) {
      const x = this.parseFloat(raw.GpsX);
      const y = this.parseFloat(raw.GpsY);
      if (x !== undefined && y !== undefined) {
        const isLat = (v: number) => v >= 27 && v <= 44;
        if (isLat(y) && !isLat(x)) { lat = y; lng = x; }
        else if (isLat(x) && !isLat(y)) { lat = x; lng = y; }
      }
    }
    if (lat === undefined || lng === undefined || (lat === 0 && lng === 0)) return {};
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return {};
    return { lat, lng };
  }

  // A new-development listing, however the feed marks it. For a Resales filter
  // these three agree (checked on a live feed: 17 / 17 / 17, matching
  // P_New_Devs=only); any one is enough. "New Construction" is only a
  // condition (a newly built resale home) and does not count.
  private isNewDevelopment(raw: any): boolean {
    if (/development/i.test(String(raw.PropertyType?.NameType || ''))) return true;
    if (raw.KeyReady !== undefined && raw.KeyReady !== null && raw.KeyReady !== '') return true;
    const categories = raw.PropertyFeatures?.Category;
    const list = Array.isArray(categories) ? categories : categories ? [categories] : [];
    return list.some((c: any) => {
      const heading = String(c?.['@_Type'] ?? c?.Type ?? '').toLowerCase();
      const values = Array.isArray(c?.Value) ? c.Value : [c?.Value];
      return heading === 'category' && values.some((v: any) => /new development/i.test(String(v ?? '')));
    });
  }

  // Resales returns either a plain letter ("A".."G") or "InProgress"/empty.
  // Normalize to uppercase A-G or undefined.
  private parseEnergyRating(value: any): string | undefined {
    if (value === null || value === undefined) return undefined;
    const v = String(value).trim().toUpperCase();
    return /^[A-G]$/.test(v) ? v : undefined;
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

  // Sales send Price; rentals (short and long term) send RentalPrice1 (from),
  // RentalPrice2 (to) and RentalPeriod ("Week", "Month") instead — checked
  // live on Solobanus 2026-10-07. A single price stays single: priceTo is set
  // only when the "to" is higher. No price at all = price on request.
  private mapPrice(raw: any): Pick<FeedProperty, 'price' | 'priceTo' | 'rentalPeriod' | 'priceOnRequest'> {
    const rental = raw.RentalPrice1 !== undefined || raw.RentalPrice2 !== undefined;
    // A development sends its range in one string: "Price": "96091 - 234530".
    const range = !rental && typeof raw.Price === 'string' ? raw.Price.match(/^\s*([\d.,]+)\s*-\s*([\d.,]+)\s*$/) : null;
    const from = rental
      ? this.parsePrice(raw.RentalPrice1) || this.parsePrice(raw.RentalPrice2)
      : this.parsePrice(range ? range[1] : raw.Price);
    const to = rental
      ? this.parsePrice(raw.RentalPrice2)
      : this.parsePrice(range ? range[2] : raw.PriceTo);
    const price = from && from > 0 ? from : null;

    const out: Pick<FeedProperty, 'price' | 'priceTo' | 'rentalPeriod' | 'priceOnRequest'> = {
      price,
      priceOnRequest: price === null || raw.Price === 'POA' || raw.PriceOnApplication === 'Yes',
    };
    if (price !== null && to && to > price) out.priceTo = to;
    const period = this.rentalPeriodOf(raw.RentalPeriod);
    if (period) out.rentalPeriod = period;
    return out;
  }

  private rentalPeriodOf(value: any): FeedProperty['rentalPeriod'] {
    const v = String(value ?? '').toLowerCase();
    if (/night|day|noche|d[ií]a/.test(v)) return 'night';
    if (/week|semana/.test(v)) return 'week';
    if (/month|mes/.test(v)) return 'month';
    return undefined;
  }

  private parsePrice(value: any): number | null {
    if (value === null || value === undefined || value === 'POA') {
      return null;
    }

    const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? null : parsed;
  }

  /** Feeds send booleans as "1"/"0", "true"/"false" or numbers. */
  private truthy(value: any): boolean | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const v = String(value).trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'y';
  }

  /** A feed value as a trimmed string, or undefined when it is empty. */
  private text(value: any): string | undefined {
    if (value === null || value === undefined) return undefined;
    const trimmed = String(value).trim();
    return trimmed === '' ? undefined : trimmed.slice(0, 20);
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
