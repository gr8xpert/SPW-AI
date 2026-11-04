import type { Property } from '../../../database/entities';
import { displayName, htmlToText } from '../idealista/idealista-builder';

// Kyero XML v3 (https://help.kyero.com/article/kyero-xml-v3). Portals fetch
// the URL; anything Kyero needs and we can't fill skips the listing.

export interface KyeroLocationRow {
  id: number;
  parentId: number | null;
  level: string;
  name: Record<string, string> | null;
}

export interface KyeroInput {
  properties: Property[];
  types: Map<number, { name: Record<string, string> | null }>;
  locations: Map<number, KyeroLocationRow>;
  features: Map<number, { name: Record<string, string> | null }>;
}

export interface KyeroResult {
  xml: string;
  included: number;
  skipped: Array<{ reference: string; reason: string }>;
}

// Languages Kyero shows descriptions in.
const LANGUAGES = ['en', 'es', 'de', 'fr', 'nl', 'it', 'pt', 'ru', 'sv', 'no', 'da', 'fi', 'pl', 'ca'];
const MAX_IMAGES = 50;
const ENERGY = /^[A-G]$/;

type KyeroLookups = Omit<KyeroInput, 'properties'>;

// The columns kyeroSkipReason reads. The Feed Export page checks a client's
// whole list with only these: images and descriptions are most of a listing's
// size, and loading them all to show a count restarted the API on large clients.
export const KYERO_CHECK_COLUMNS = [
  'id',
  'reference',
  'price',
  'listingType',
  'rentalPeriod',
  'propertyTypeId',
  'feedType',
  'locationId',
  'feedLocation',
] as const;

type KyeroCheckFields = Pick<Property, (typeof KYERO_CHECK_COLUMNS)[number]>;

// Takes listings a batch at a time, so a large feed never holds them all at once.
export class KyeroFeedWriter {
  private readonly parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<root>\n  <kyero>\n    <feed_version>3</feed_version>\n  </kyero>'];
  private readonly skipped: KyeroResult['skipped'] = [];
  private included = 0;

  constructor(private readonly lookups: KyeroLookups) {}

  add(properties: Property[]): void {
    for (const p of properties) {
      const out = buildProperty(p, this.lookups);
      if (typeof out === 'string') {
        this.skipped.push({ reference: p.reference, reason: out });
        continue;
      }
      this.parts.push(out.join('\n'));
      this.included++;
    }
  }

  finish(): KyeroResult {
    return { xml: [...this.parts, '</root>'].join('\n'), included: this.included, skipped: this.skipped };
  }
}

export function buildKyeroFeed(input: KyeroInput): KyeroResult {
  const writer = new KyeroFeedWriter(input);
  writer.add(input.properties);
  return writer.finish();
}

// Why Kyero can't take this listing, or null when it can.
export function kyeroSkipReason(p: KyeroCheckFields, lookups: KyeroLookups): string | null {
  const required = requiredFields(p, lookups);
  return typeof required === 'string' ? required : null;
}

function requiredFields(p: KyeroCheckFields, input: KyeroLookups) {
  const price = toInt(p.price);
  if (!price) return 'No price';

  const freq = priceFreq(p);
  if (!freq) return 'Nightly rental price — Kyero takes only weekly or monthly rents';

  const type = displayName(input.types.get(p.propertyTypeId ?? -1)?.name) || p.feedType?.name || '';
  if (!type) return 'No property type';

  const chain = locationChain(p.locationId, input.locations);
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
  if (!town) return 'No town';
  if (!province) return 'No province';
  return { price, freq, type, chain, town, province };
}

function buildProperty(p: Property, input: KyeroLookups): string[] | string {
  const required = requiredFields(p, input);
  if (typeof required === 'string') return required;
  const { price, freq, type, chain, town, province } = required;

  const featureNames = [...new Set(
    (p.features || [])
      .map((id) => input.features.get(id)?.name)
      .map((name) => (name?.en || displayName(name)).trim())
      .filter(Boolean),
  )];
  const pool = featureNames.some((f) => /pool|piscina/i.test(f)) ? 1 : 0;
  const newBuild =
    p.listingType === 'development' || featureNames.some((f) => /new ?build|obra nueva/i.test(f)) ? 1 : 0;

  const x: string[] = ['  <property>'];
  const tag = (name: string, value: string | number, indent = 4) =>
    x.push(`${' '.repeat(indent)}<${name}>${esc(String(value))}</${name}>`);

  tag('id', p.id);
  tag('date', kyeroDate(p.updatedAt));
  tag('ref', p.reference);
  tag('price', price);
  tag('currency', /^(EUR|GBP|USD)$/.test(p.currency || '') ? p.currency : 'EUR');
  tag('price_freq', freq);
  tag('part_ownership', 0);
  tag('leasehold', 0);
  tag('new_build', newBuild);
  tag('type', type);
  tag('town', town);
  tag('province', province);
  tag('country', 'Spain');
  // The urbanisation or area the listing sits in, below the town (never a parent area).
  const townAt = chain.findIndex((l) => l.level === 'town' || l.level === 'municipality');
  const below = townAt === -1 ? [] : chain.slice(0, townAt);
  const detail = p.urbanization || displayName(below.find((l) => l.level === 'urbanization' || l.level === 'area')?.name);
  if (detail && detail !== town) tag('location_detail', detail);
  if (validCoords(p.lat, p.lng)) {
    x.push('    <location>');
    tag('latitude', Number(p.lat), 6);
    tag('longitude', Number(p.lng), 6);
    x.push('    </location>');
  }
  tag('beds', toInt(p.bedrooms) ?? 0);
  tag('baths', toInt(p.bathrooms) ?? 0);
  tag('pool', pool);

  const built = toInt(p.buildSize);
  const plot = toInt(p.plotSize);
  if (built || plot) {
    x.push('    <surface_area>');
    if (built) tag('built', built, 6);
    if (plot) tag('plot', plot, 6);
    x.push('    </surface_area>');
  }

  const energy = (p.energyRating || '').trim().toUpperCase();
  if (ENERGY.test(energy)) {
    x.push('    <energy_rating>');
    tag('consumption', energy, 6);
    x.push('    </energy_rating>');
  }

  const descs = descriptions(p.description);
  if (descs.length) {
    x.push('    <desc>');
    for (const [lang, text] of descs) tag(lang, text, 6);
    x.push('    </desc>');
  }

  if (featureNames.length) {
    x.push('    <features>');
    for (const f of featureNames) tag('feature', f, 6);
    x.push('    </features>');
  }

  const images = [...(p.images || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((img) => (img.url || '').trim())
    .filter((url) => /^https?:\/\/\S+$/i.test(url))
    .slice(0, MAX_IMAGES);
  if (images.length) {
    x.push('    <images>');
    images.forEach((url, i) => {
      x.push(`      <image id="${i + 1}">`);
      tag('url', url, 8);
      x.push('      </image>');
    });
    x.push('    </images>');
  }

  x.push('  </property>');
  return x;
}

// sale | week | month. Holiday rents default to weekly, long-term to monthly.
function priceFreq(p: Pick<Property, 'listingType' | 'rentalPeriod'>): 'sale' | 'week' | 'month' | null {
  if (p.listingType === 'sale' || p.listingType === 'development') return 'sale';
  const period = p.rentalPeriod ?? (p.listingType === 'holiday_rent' ? 'week' : 'month');
  if (period === 'night') return null;
  return period;
}

function descriptions(description: Record<string, string> | null): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const used = new Set<string>();
  for (const [code, raw] of Object.entries(description || {})) {
    const lang = code.toLowerCase().slice(0, 2);
    const text = htmlToText(raw || '');
    if (!LANGUAGES.includes(lang) || !text || used.has(lang)) continue;
    used.add(lang);
    out.push([lang, text]);
  }
  return out;
}

function locationChain(id: number | null, locations: Map<number, KyeroLocationRow>): KyeroLocationRow[] {
  const chain: KyeroLocationRow[] = [];
  const seen = new Set<number>();
  let cur = id != null ? locations.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId != null ? locations.get(cur.parentId) : undefined;
  }
  return chain;
}

// "2026-09-05 17:13:58"
function kyeroDate(d: Date | null | undefined): string {
  return (d ?? new Date()).toISOString().slice(0, 19).replace('T', ' ');
}

function toInt(value: unknown): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function validCoords(lat: unknown, lng: unknown): boolean {
  if (lat == null || lng == null) return false;
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
}

// Escapes markup and drops characters XML 1.0 doesn't allow.
export function esc(text: string): string {
  return text
    .replace(/[^\x09\x0A\x0D\x20-퟿-�\u{10000}-\u{10FFFF}]/gu, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
