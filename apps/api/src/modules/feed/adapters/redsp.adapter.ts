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

// RedSP XML feed, v4 (https://xml.redsp.net/files/<agency>/<key>/<name>_v4.xml).
// New-build units on the Spanish coast: one <property> per unit, units of a
// development share development_ref, title and photos. The private URL is the
// credential (credentials.endpoint).
//
// Looks like Kyero but isn't: nested <address>, *_m2 sizes, features as 0/1
// flags, photos tagged "floorplan" — hence its own mapper.

// 0/1 flags → feature name + category. Names follow the Resales feed so a
// client with both feeds gets one "Gated Complex", not two.
const FLAG_FEATURES: Record<string, Record<string, [string, string]>> = {
  features: {
    Air_Conditioning: ['Air Conditioning', 'climate'],
    Appliances: ['Fully Fitted Kitchen', 'interior'],
    Armored_Door: ['Armoured Door', 'security'],
    bbq: ['Barbeque', 'exterior'],
    corner: ['Corner Property', 'other'],
    coworking: ['Coworking Space', 'community'],
    domotics: ['Domotics', 'interior'],
    electric_blinds: ['Electric Blinds', 'interior'],
    furnished: ['Fully Furnished', 'interior'],
    games_room: ['Games Room', 'interior'],
    garden: ['Garden', 'exterior'],
    gated: ['Gated Complex', 'security'],
    gym: ['Gym', 'community'],
    heating: ['Heating', 'climate'],
    jacuzzi: ['Jacuzzi', 'interior'],
    laundry_room: ['Utility Room', 'interior'],
    lift: ['Lift', 'interior'],
    patio: ['Patio', 'exterior'],
    safe_box: ['Safe', 'security'],
    solarium: ['Solarium', 'exterior'],
    spa: ['Spa', 'community'],
    storage: ['Storage Room', 'interior'],
  },
  views: {
    sea_views: ['Sea Views', 'views'],
    village_views: ['Village Views', 'views'],
    garden_views: ['Garden Views', 'views'],
    pool_views: ['Pool Views', 'views'],
    open_views: ['Panoramic Views', 'views'],
    mountain_views: ['Mountain Views', 'views'],
  },
  pools: {
    communal_pool: ['Communal Pool', 'community'],
    private_pool: ['Private Pool', 'exterior'],
  },
  category: {
    urban: ['Town', 'other'],
    beach: ['Close To Beach', 'exterior'],
    golf: ['Close To Golf', 'exterior'],
    countryside: ['Country', 'exterior'],
    first_line: ['Frontline Beach', 'exterior'],
  },
};

@Injectable()
export class RedspAdapter extends BaseFeedAdapter {
  readonly provider = 'redsp';
  readonly displayName = 'RedSP';

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    // Keep values as text (refs, postcodes); numbers are parsed per field.
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    isArray: (name) => ['property', 'image', 'feature', 'tag'].includes(name),
  });

  async validateCredentials(credentials: FeedCredentials): Promise<FeedValidationResult> {
    if (!credentials.endpoint) {
      return { valid: false, error: 'RedSP: feed URL is required' };
    }
    return probeXml(credentials.endpoint, ['<redsp', '<property'], 'RedSP');
  }

  async fetchProperties(
    credentials: FeedCredentials,
    page: number = 1,
    limit: number = 100,
  ): Promise<FeedImportResult> {
    const url = credentials.endpoint;
    if (!url) {
      throw new Error('RedSP: feed URL is required');
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
    const priceTo = toNumber(raw.price_to);
    const freq = String(raw.price_freq ?? 'sale').toLowerCase();
    const rental = freq === 'week' || freq === 'month';
    const address = raw.address ?? {};
    const town = this.text(address.town);
    const area = this.text(raw.location_detail_1);
    const sizes = raw.surface_area ?? {};
    const { names, categories } = this.mapFeatures(raw);

    return {
      externalId: id,
      reference: this.text(raw.ref) ?? id,
      title: this.multilingual(raw.title),
      description: this.multilingual(raw.desc),
      listingType: rental
        ? 'rent'
        : raw.new_build === '1' ? 'development' : 'sale',
      propertyType: this.text(raw.type) ?? 'Unknown',
      price: price && price > 0 ? price : null,
      ...(priceTo && price && priceTo > price ? { priceTo } : {}),
      priceOnRequest: !price,
      ...(rental ? { rentalPeriod: freq as 'week' | 'month' } : {}),
      currency: String(raw.currency || 'EUR').toUpperCase(),
      bedrooms: toNumber(raw.beds),
      bathrooms: toNumber(raw.baths),
      buildSize: this.positive(sizes.built_m2),
      plotSize: this.positive(sizes.plot_m2),
      terraceSize: this.positive(sizes.terrace_m2),
      gardenSize: this.positive(sizes.garden_m2),
      images: this.mapImages(raw.images),
      features: names,
      featureCategories: categories,
      location: {
        name: area ?? town ?? '',
        province: this.text(address.province),
        area: this.text(raw.costa),
        municipality: town,
        town,
        // "pueblo" = the village centre, not a place name.
        urbanization: area && area.toLowerCase() !== 'pueblo' ? area : undefined,
        country: this.text(raw.country) ?? 'Spain',
      },
      postcode: this.text(address.postal_code),
      lat: toNumber(raw.location?.latitude),
      lng: toNumber(raw.location?.longitude),
      videoUrl: this.url(raw.media?.videos),
      virtualTourUrl: this.url(raw.media?.virtual_tour),
      deliveryDate: this.text(raw.delivery_date),
      builtYear: this.positive(raw.year_build),
      keyReady: raw.key_ready === '1',
      energyRating: toEnergyRating(raw.energy_rating?.consumption),
    };
  }

  // <title><en><![CDATA[…]]></en><es>…</es>…</title>. Line breaks arrive as a
  // literal "&#13;" inside CDATA, so they are never decoded by the parser.
  private multilingual(node: any): Record<string, string> {
    const out = this.extractMultilingual(node ?? {});
    for (const [lang, value] of Object.entries(out)) {
      const clean = value.replace(/&#(13|10);/g, '\n').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (clean) out[lang] = clean;
      else delete out[lang];
    }
    return out;
  }

  private mapFeatures(raw: any): { names: string[]; categories: Record<string, string> } {
    const names: string[] = [];
    const categories: Record<string, string> = {};
    const add = (name: string, category: string) => {
      if (categories[name.toLowerCase()]) return;
      names.push(name);
      categories[name.toLowerCase()] = category;
    };
    for (const [group, flags] of Object.entries(FLAG_FEATURES)) {
      const node = raw[group] ?? {};
      for (const [flag, [name, category]] of Object.entries(flags)) {
        if (node[flag] === '1') add(name, category);
      }
    }
    if (raw.pools?.pool === '1' && !names.some((n) => n.endsWith('Pool'))) add('Pool', 'community');
    if (toNumber(raw.parking?.number_of_garage_spaces)) add('Garage', 'parking');
    else if (toNumber(raw.parking?.number_of_parking_spaces)) add('Private Parking', 'parking');
    for (const f of raw.extra_features?.feature ?? []) {
      const name = this.text(f);
      if (name) add(name, 'other');
    }
    return { names, categories };
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
