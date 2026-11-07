import type { Property } from '../../../database/entities';
import type { ExportLookups } from '../export-rows';
import { esc, kyeroDate, pickLanguages, toInt, validCoords, KyeroResult } from '../kyero/kyero-builder';
import type { PortalOptions } from '../portal-writers';
import { feedLanguages, listingFacts, nameIn, XmlLines } from './portal-common';

// thinkSPAIN XML import, version 1.15. No public spec: this follows the feed
// the client's old CRM sent thinkSPAIN (which they import today) plus the
// fields a published thinkSPAIN exporter writes (location, url).
// The feed is a full snapshot: a listing missing from it is removed there.

const DEFAULT_LANGUAGES = ['en'];
const MAX_IMAGES = 50;

// thinkSPAIN's property types. Ours are matched to the closest one by name.
const TYPES: Array<[RegExp, string]> = [
  [/penthouse|[aá]tico/i, 'Penthouse'],
  [/studio|estudio/i, 'Studio'],
  [/duplex|d[uú]plex/i, 'Duplex'],
  [/loft/i, 'Loft'],
  [/town ?house|adosad|terraced house/i, 'Townhouse'],
  [/semi[- ]?detached|pareada/i, 'Semi-detached Villa'],
  [/terraced villa/i, 'Terraced Villa'],
  [/bungalow/i, 'Bungalow'],
  [/finca|cortijo|country house|rustic/i, 'Finca/Country House'],
  [/cave/i, 'Cave House'],
  [/mobile home/i, 'Mobile Home'],
  [/wooden/i, 'Wooden Home'],
  [/ruin/i, 'Ruin'],
  [/building plot|urban plot|^plot|solar|parcela/i, 'Building Plot'],
  [/land|terreno|r[uú]stic plot/i, 'Undeveloped Land'],
  [/garage|parking|garaje/i, 'Garage'],
  [/hotel/i, 'Hotel'],
  [/restaurant|bar\b/i, 'Restaurant/Bar'],
  [/office|oficina/i, 'Office'],
  [/shop|local|retail|tienda/i, 'Shop'],
  [/commercial|business|comercial|warehouse|nave/i, 'Commercial'],
  [/villa|chalet|detached|house|casa/i, 'Villa'],
  [/apartment|flat|piso|apartamento|floor/i, 'Apartment'],
];

export function thinkSpainType(name: string): string {
  for (const [re, type] of TYPES) if (re.test(name)) return type;
  return name;
}

export class ThinkSpainFeedWriter {
  private readonly parts: string[];
  private readonly skipped: KyeroResult['skipped'] = [];
  private included = 0;

  constructor(
    private readonly lookups: ExportLookups,
    private readonly options: PortalOptions,
  ) {
    this.parts = [
      "<?xml version='1.0' encoding='UTF-8'?>",
      '<root>',
      '  <thinkspain>',
      '    <import_version>1.15</import_version>',
      '  </thinkspain>',
      '  <agent>',
      `    <name>${esc(options.agentName)}</name>`,
      '  </agent>',
    ];
  }

  add(properties: Property[]): void {
    for (const p of properties) {
      const out = this.property(p);
      if (typeof out === 'string') this.skipped.push({ reference: p.reference, reason: out });
      else {
        this.parts.push(out.xml);
        this.included++;
      }
    }
  }

  finish(): KyeroResult {
    return { xml: [...this.parts, '</root>'].join('\n'), included: this.included, skipped: this.skipped };
  }

  // The listing's XML, or why it is left out.
  private property(p: Property): { xml: string } | string {
    const facts = listingFacts(p, this.lookups, MAX_IMAGES);
    if (typeof facts === 'string') return facts;
    if (facts.freq === 'week') return 'Weekly rental — thinkSPAIN takes sales and monthly rents';
    const langs = feedLanguages(this.options.languages, DEFAULT_LANGUAGES);
    const x = new XmlLines(esc);

    x.open('property', 2);
    x.tag('last_amended_date', kyeroDate(p.updatedAt), 4);
    x.tag('unique_id', p.reference, 4);
    x.tag('agent_ref', p.agentReference || '', 4);
    x.tag('euro_price', facts.price, 4);
    x.tag('currency', 'EUR', 4);
    x.tag('sale_type', facts.freq === 'sale' ? 'sale' : 'rent', 4);
    x.tag('property_type', thinkSpainType(facts.type), 4);
    x.tag('town', facts.town, 4);
    x.tag('province', facts.province, 4);
    x.tag('postcode', (p.postcode || '').trim(), 4);
    if (validCoords(p.lat, p.lng)) {
      x.open('location', 4);
      x.tag('latitude', Number(p.lat), 6);
      x.tag('longitude', Number(p.lng), 6);
      x.close('location', 4);
    }
    const url = this.options.urlFor?.(p);
    if (url) x.tag('url', url, 4);
    x.tag('bedrooms', toInt(p.bedrooms) ?? 0, 4);
    x.tag('bathrooms', toInt(p.bathrooms) ?? 0, 4);
    const built = toInt(p.buildSize);
    if (built) x.tag('living_area', built, 4);

    const features = [...new Set(facts.features.map((n) => nameIn(n, 'en')).filter(Boolean))];
    if (features.length) {
      x.open('features', 4);
      for (const f of features) x.tag('feature', f, 6);
      x.close('features', 4);
    }

    const descs = pickLanguages(p.description, langs);
    if (descs.length) {
      x.open('description', 4);
      for (const [lang, text] of descs) x.tag(lang, text, 6);
      x.close('description', 4);
    }

    if (facts.images.length) {
      x.open('images', 4);
      facts.images.forEach((img, i) => {
        x.open('photo', 6, ` id="${i + 1}"`);
        x.tag('url', img, 8);
        x.close('photo', 6);
      });
      x.close('images', 4);
    }

    if (/^https?:\/\//i.test(p.videoUrl || '')) x.tag('video_url', p.videoUrl!.trim(), 4);
    if (/^https?:\/\//i.test(p.virtualTourUrl || '')) x.tag('virtual_tour_url', p.virtualTourUrl!.trim(), 4);
    if (p.listingType === 'development' || features.some((f) => /new ?build|obra nueva/i.test(f))) x.tag('new_build', 1, 4);
    const plot = toInt(p.plotSize);
    if (plot) x.tag('plot_size', plot, 4);
    x.close('property', 2);
    return { xml: x.lines.join('\n') };
  }
}
