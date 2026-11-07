import type { Property } from '../../../database/entities';
import type { ExportLookups } from '../export-rows';
import { esc, pickLanguages, toInt, validCoords, KyeroResult } from '../kyero/kyero-builder';
import type { PortalOptions } from '../portal-writers';
import { communityOf, feedLanguages, listingFacts, nameIn, XmlLines } from './portal-common';

// A Place in the Sun property XML. APITS publishes no spec (agents get it from
// their account manager): this follows the feed a client's old CRM sends
// them today, element for element. Sales only; up to 60 photos a listing.

const DEFAULT_LANGUAGES = ['en'];
const MAX_IMAGES = 60;
const INTRO_MAX = 300;

export class ApitsFeedWriter {
  private readonly parts = ["<?xml version='1.0' encoding='UTF-8'?>", '<Properties>'];
  private readonly skipped: KyeroResult['skipped'] = [];
  private included = 0;

  constructor(
    private readonly lookups: ExportLookups,
    private readonly options: PortalOptions,
  ) {}

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
    return { xml: [...this.parts, '</Properties>'].join('\n'), included: this.included, skipped: this.skipped };
  }

  // The listing's XML, or why it is left out.
  private property(p: Property): { xml: string } | string {
    if (p.listingType !== 'sale' && p.listingType !== 'development') return 'Rental — A Place in the Sun takes sales only';
    const facts = listingFacts(p, this.lookups, MAX_IMAGES);
    if (typeof facts === 'string') return facts;
    const langs = feedLanguages(this.options.languages, DEFAULT_LANGUAGES);
    const descs = pickLanguages(p.description, langs);
    const x = new XmlLines(esc);

    x.open('Property', 2);
    x.tag('UniquePropertyID', p.reference, 4);

    x.open('PropertyName', 4);
    for (const lang of langs) {
      const title = nameIn(p.title, lang) || `${facts.type} for sale in ${facts.town}`;
      x.tag(lang, title, 6);
    }
    x.close('PropertyName', 4);

    x.open('Description', 4);
    for (const [lang, text] of descs) x.tag(lang, text, 6);
    x.close('Description', 4);
    x.open('Introduction', 4);
    for (const [lang, text] of descs) x.tag(lang, intro(text), 6);
    x.close('Introduction', 4);

    x.tag('SalePrice', facts.price, 4);
    x.tag('currency', 'EUR', 4);
    x.tag('Country', 'Spain', 4);
    x.tag('Region', communityOf(facts.province), 4);
    x.tag('Subregion', facts.province, 4);
    x.tag('Town', facts.town, 4);
    x.tag('Postcode', (p.postcode || '').trim(), 4);
    // The street is never published: agents hand over the address at viewing.
    x.tag('Address', '', 4);
    const coords = validCoords(p.lat, p.lng);
    x.open('GeoLocation', 4);
    x.tag('Latitude', coords ? Number(p.lat) : '', 6);
    x.tag('Longitude', coords ? Number(p.lng) : '', 6);
    x.close('GeoLocation', 4);
    x.tag('location_detail', facts.detail, 4);
    x.tag('NumBedrooms', toInt(p.bedrooms) ?? 0, 4);
    x.tag('NumBathrooms', toInt(p.bathrooms) ?? 0, 4);

    const englishFeatures = facts.features.map((n) => nameIn(n, 'en'));
    const pool = englishFeatures.some((f) => /pool|piscina/i.test(f)) ? 1 : 0;
    const newBuild = p.listingType === 'development' || englishFeatures.some((f) => /new ?build|obra nueva/i.test(f)) ? 1 : 0;
    x.tag('Pool', pool, 4);
    x.tag('NewBuild', newBuild, 4);

    x.open('surface_area', 4);
    x.tag('built', toInt(p.buildSize) ?? '', 6);
    x.tag('plot', toInt(p.plotSize) ?? '', 6);
    x.close('surface_area', 4);

    x.open('Features', 4);
    const seen = new Set<string>();
    for (const name of facts.features) {
      const key = nameIn(name, 'en').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      x.open('feature', 6);
      for (const lang of langs) x.tag(lang, nameIn(name, lang), 8);
      x.close('feature', 6);
    }
    x.close('Features', 4);

    x.open('Photos', 4);
    for (const url of facts.images) {
      x.open('Photo', 6);
      x.tag('Url', url, 8);
      x.tag('Caption', '', 8);
      x.close('Photo', 6);
    }
    x.close('Photos', 4);

    x.tag('property_type', facts.type, 4);
    x.close('Property', 2);
    return { xml: x.lines.join('\n') };
  }
}

// The opening of the description: its first paragraph, cut at a word near INTRO_MAX.
function intro(text: string): string {
  const first = text.split(/\n\s*\n|\r\n\s*\r\n/)[0].trim();
  if (first.length <= INTRO_MAX) return first;
  const cut = first.slice(0, INTRO_MAX);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 200 ? space : INTRO_MAX).trim()}…`;
}
