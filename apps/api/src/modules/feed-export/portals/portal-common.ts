import type { Property } from '../../../database/entities';
import { displayName } from '../idealista/idealista-builder';
import { kyeroSkipReason, locationChain, priceFreq, toInt } from '../kyero/kyero-builder';
import type { ExportLookups } from '../export-rows';

// What the ThinkSpain and A Place in the Sun writers both read from a listing.

export interface ListingFacts {
  price: number;
  freq: 'sale' | 'week' | 'month';
  type: string;
  town: string;
  province: string;
  // Below the town: the urbanisation or area, '' when none.
  detail: string;
  features: Array<Record<string, string> | null>;
  images: string[];
}

// The facts, or why the listing is left out (same rules as Kyero).
export function listingFacts(p: Property, lookups: ExportLookups, maxImages: number): ListingFacts | string {
  const reason = kyeroSkipReason(p, lookups);
  if (reason) return reason;
  const chain = locationChain(p.locationId, lookups.locations);
  const town =
    displayName(chain.find((l) => l.level === 'town' || l.level === 'municipality')?.name) ||
    displayName(chain[0]?.name) ||
    p.feedLocation?.town ||
    '';
  const province =
    displayName(chain.find((l) => l.level === 'province')?.name) ||
    p.feedLocation?.province ||
    displayName(chain.find((l) => l.level === 'region')?.name) ||
    '';
  const townAt = chain.findIndex((l) => l.level === 'town' || l.level === 'municipality');
  const below = townAt === -1 ? [] : chain.slice(0, townAt);
  const detailRaw =
    p.urbanization || displayName(below.find((l) => l.level === 'urbanization' || l.level === 'area')?.name) || '';
  const type = displayName(lookups.types.get(p.propertyTypeId ?? -1)?.name) || p.feedType?.name || '';
  const seen = new Set<number>();
  const features = (p.features || [])
    .filter((id) => !seen.has(id) && seen.add(id))
    .map((id) => lookups.features.get(id)?.name ?? null)
    .filter((n) => !!displayName(n));
  const images = [...(p.images || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((img) => (img.url || '').trim())
    .filter((url) => /^https?:\/\/\S+$/i.test(url))
    .slice(0, maxImages);
  return {
    price: toInt(p.price)!,
    freq: priceFreq(p)!,
    type,
    town,
    province,
    detail: detailRaw && detailRaw !== town ? detailRaw : '',
    features,
    images,
  };
}

// A feature/title name in one language: that language, else English, else any.
export function nameIn(name: Record<string, string> | null | undefined, lang: string): string {
  if (!name) return '';
  return (name[lang] || name.en || displayName(name) || '').trim();
}

// The languages to write: the feed's own list, else `fallback`.
export function feedLanguages(chosen: string[], fallback: string[]): string[] {
  return chosen.length ? chosen : fallback;
}

// Small XML line builder with indentation.
export class XmlLines {
  readonly lines: string[] = [];
  constructor(private readonly esc: (s: string) => string) {}
  open(name: string, indent: number, attrs = '') {
    this.lines.push(`${' '.repeat(indent)}<${name}${attrs}>`);
  }
  close(name: string, indent: number) {
    this.lines.push(`${' '.repeat(indent)}</${name}>`);
  }
  tag(name: string, value: string | number | null | undefined, indent: number) {
    const v = value == null ? '' : String(value);
    this.lines.push(`${' '.repeat(indent)}<${name}>${this.esc(v)}</${name}>`);
  }
}

// Spanish province → autonomous community (A Place in the Sun's "Region").
const COMMUNITY: Record<string, string> = {
  almeria: 'Andalucia', cadiz: 'Andalucia', cordoba: 'Andalucia', granada: 'Andalucia', huelva: 'Andalucia',
  jaen: 'Andalucia', malaga: 'Andalucia', sevilla: 'Andalucia', seville: 'Andalucia',
  alicante: 'Valencia', alacant: 'Valencia', castellon: 'Valencia', valencia: 'Valencia',
  murcia: 'Murcia',
  baleares: 'Balearic Islands', 'balearic islands': 'Balearic Islands', 'illes balears': 'Balearic Islands', mallorca: 'Balearic Islands', ibiza: 'Balearic Islands', menorca: 'Balearic Islands',
  'las palmas': 'Canary Islands', 'santa cruz de tenerife': 'Canary Islands', tenerife: 'Canary Islands', 'gran canaria': 'Canary Islands',
  barcelona: 'Catalonia', girona: 'Catalonia', gerona: 'Catalonia', lleida: 'Catalonia', tarragona: 'Catalonia',
  madrid: 'Madrid',
  'a coruna': 'Galicia', lugo: 'Galicia', ourense: 'Galicia', pontevedra: 'Galicia',
  asturias: 'Asturias', cantabria: 'Cantabria', navarra: 'Navarra', 'la rioja': 'La Rioja',
  alava: 'Basque Country', araba: 'Basque Country', bizkaia: 'Basque Country', vizcaya: 'Basque Country', gipuzkoa: 'Basque Country', guipuzcoa: 'Basque Country',
  huesca: 'Aragon', teruel: 'Aragon', zaragoza: 'Aragon',
  albacete: 'Castilla-La Mancha', 'ciudad real': 'Castilla-La Mancha', cuenca: 'Castilla-La Mancha', guadalajara: 'Castilla-La Mancha', toledo: 'Castilla-La Mancha',
  avila: 'Castilla y Leon', burgos: 'Castilla y Leon', leon: 'Castilla y Leon', palencia: 'Castilla y Leon', salamanca: 'Castilla y Leon',
  segovia: 'Castilla y Leon', soria: 'Castilla y Leon', valladolid: 'Castilla y Leon', zamora: 'Castilla y Leon',
  badajoz: 'Extremadura', caceres: 'Extremadura',
};

export function communityOf(province: string): string {
  const key = province
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^(provincia de|province of)\s+/, '')
    .trim();
  return COMMUNITY[key] || '';
}
