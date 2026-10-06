// Builds the idealista customer JSON (feed v6) from a client's listings.
// Pure: the service loads the rows, this only maps them. A listing idealista
// would reject is left out with a reason instead of being sent — one bad
// listing must not get the whole file refused.

import type { IdealistaExportSettings, Property } from '../../../database/entities';
import { propertyUrlSegment } from '../../property/property-url';
import {
  DESCRIPTION_LANGUAGES,
  ENERGY_RATINGS,
  FEATURE_KEYWORDS,
  IdealistaCategory,
  VIDEO_FILE_RE,
  flatFlags,
  guessIdealistaType,
  idealistaCategory,
  isIdealistaType,
  orientationKeys,
} from './idealista-catalog';

export interface TypeRow {
  id: number;
  parentId: number | null;
  name: Record<string, string> | null;
  idealistaType: string | null;
}

export interface LocationRow {
  id: number;
  parentId: number | null;
  level: string;
  name: Record<string, string> | null;
  lat: number | null;
  lng: number | null;
  postcode: string | null; // from the location template, when linked
}

export interface FeatureRow {
  id: number;
  name: Record<string, string> | null;
}

export interface BuilderInput {
  settings: IdealistaExportSettings;
  properties: Property[];
  types: Map<number, TypeRow>;
  locations: Map<number, LocationRow>;
  features: Map<number, FeatureRow>;
  slugFormat?: unknown;
  now?: Date;
}

export interface SkippedListing {
  id: number;
  reference: string;
  reason: string;
}

// A listing that is sent but will look poor on idealista (or loses something).
export interface ListingIssues {
  id: number;
  reference: string;
  issues: string[];
}

export interface BuilderResult {
  feed: Record<string, unknown>;
  included: number;
  skipped: SkippedListing[];
  issues: ListingIssues[];
}

export type TypeSource = 'set' | 'parent' | 'guess';

export function displayName(name: Record<string, string> | null | undefined): string {
  if (!name) return '';
  return name.en || name.es || Object.values(name).find(Boolean) || '';
}

// The idealista type a property type exports as: its own setting, else the
// nearest parent's, else a guess from its name (then its parents' names).
export function resolveIdealistaType(
  typeId: number | null,
  types: Map<number, TypeRow>,
): { value: string | null; source: TypeSource | null } {
  const chain: TypeRow[] = [];
  const seen = new Set<number>();
  let cur = typeId != null ? types.get(typeId) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId != null ? types.get(cur.parentId) : undefined;
  }
  for (let i = 0; i < chain.length; i++) {
    if (isIdealistaType(chain[i].idealistaType)) {
      return { value: chain[i].idealistaType, source: i === 0 ? 'set' : 'parent' };
    }
  }
  const names = chain.flatMap((t) => [t.name?.en, t.name?.es, ...Object.values(t.name || {})]);
  const guess = guessIdealistaType(...names);
  return guess ? { value: guess, source: 'guess' } : { value: null, source: null };
}

export function buildIdealistaFeed(input: BuilderInput): BuilderResult {
  const { settings } = input;
  const skipped: SkippedListing[] = [];
  const issues: ListingIssues[] = [];
  const customerProperties: Record<string, unknown>[] = [];

  for (const p of input.properties) {
    const result = buildProperty(p, input);
    if (typeof result === 'string') {
      skipped.push({ id: p.id, reference: p.reference, reason: result });
      continue;
    }
    customerProperties.push(result);
    const found = listingIssues(p, result, settings.country || 'Spain');
    if (found.length) issues.push({ id: p.id, reference: p.reference, issues: found });
  }

  const feed: Record<string, unknown> = {
    customerCountry: settings.country || 'Spain',
    customerCode: (settings.customerCode || '').trim(),
    customerSendDate: sendDate(input.now ?? new Date()),
  };
  const contact = buildContact(settings);
  if (contact) feed.customerContact = contact;
  feed.customerProperties = customerProperties;

  return { feed, included: customerProperties.length, skipped, issues };
}

const MIN_PHOTOS = 5;
const LOCAL_LANGUAGE: Record<string, string> = { Spain: 'spanish', Portugal: 'portuguese', Italy: 'italian' };

// What idealista would take but show badly, or what the feed had to drop.
function listingIssues(p: Property, out: Record<string, unknown>, country: string): string[] {
  const found: string[] = [];
  const photos = (out.propertyImages as unknown[] | undefined)?.length ?? 0;
  const badPhotos = (p.images || []).length - photos;
  if (!photos) found.push('No photos');
  else if (photos < MIN_PHOTOS) found.push(`Only ${photos} photo${photos === 1 ? '' : 's'}`);
  if (badPhotos > 0 && (p.images || []).length <= 200) {
    found.push(`${badPhotos} photo${badPhotos === 1 ? ' has' : 's have'} no full web address and ${badPhotos === 1 ? 'is' : 'are'} left out`);
  }

  const descriptions = (out.propertyDescriptions as Array<{ descriptionLanguage: string }> | undefined) || [];
  const local = LOCAL_LANGUAGE[country];
  if (!descriptions.length) found.push('No description');
  else if (local && !descriptions.some((d) => d.descriptionLanguage === local)) {
    found.push(`No ${local[0].toUpperCase()}${local.slice(1)} description`);
  }
  const longest = Math.max(0, ...Object.values(p.description || {}).map((t) => htmlToText(t || '').length));
  if (longest > 4000) found.push('Description is longer than 4000 characters and is cut off');

  const features = out.propertyFeatures as Record<string, unknown>;
  const category = idealistaCategory(String(features.featuresType));
  if (country === 'Spain' && category !== 'land' && category !== 'garage' && category !== 'storage' && !features.featuresEnergyCertificateRating) {
    found.push('No energy rating (required to advertise in Spain)');
  }

  if (p.videoUrl && !out.propertyVideos) {
    found.push('Video is not a video file (e.g. a YouTube link) — idealista only takes files, so it is left out');
  }
  return found;
}

// ---------------------------------------------------------------------------

function buildProperty(p: Property, input: BuilderInput): Record<string, unknown> | string {
  const { settings } = input;

  // Operation
  let operationType: 'sale' | 'rent';
  if (p.listingType === 'sale' || p.listingType === 'development') operationType = 'sale';
  else if (p.listingType === 'rent') operationType = 'rent';
  else return 'Holiday rentals are not published on idealista';

  const price = toInt(p.price);
  if (!price) return 'No price';
  const operation: Record<string, unknown> = { operationType, operationPrice: price };
  const community = toInt(p.communityFees);
  if (community) operation.operationPriceCommunity = community;

  // Type
  const { value: type } = resolveIdealistaType(p.propertyTypeId, input.types);
  if (!type) return 'Property type has no idealista type — set it under Feed Export → idealista';
  const category = idealistaCategory(type) as IdealistaCategory;

  const features = buildFeatures(p, type, category, operationType, input);
  if (typeof features === 'string') return features;

  const address = buildAddress(p, input);
  if (typeof address === 'string') return address;

  const out: Record<string, unknown> = {
    propertyCode: (p.agentReference || p.reference).slice(0, 50),
    propertyReference: p.reference.slice(0, 50),
    propertyVisibility: 'idealista',
    propertyOperation: operation,
    propertyAddress: address,
    propertyFeatures: features,
  };

  const descriptions = buildDescriptions(p.description);
  if (descriptions.length) out.propertyDescriptions = descriptions;

  const images = [...(p.images || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((img) => img.url)
    .filter(isHttpUrl)
    .slice(0, 200)
    .map((imageUrl, i) => ({ imageOrder: i + 1, imageUrl }));
  if (images.length) out.propertyImages = images;

  if (p.videoUrl && isHttpUrl(p.videoUrl) && VIDEO_FILE_RE.test(p.videoUrl)) {
    out.propertyVideos = [{ videoOrder: 1, videoUrl: p.videoUrl }];
  }

  if (p.virtualTourUrl && isHttpUrl(p.virtualTourUrl)) {
    out.propertyVirtualTours = /matterport\.com/i.test(p.virtualTourUrl)
      ? { virtualTour3D: { virtualTour3DType: 'matterport', virtualTourUrl: p.virtualTourUrl } }
      : { virtualTour: { virtualTourUrl: p.virtualTourUrl } };
  }

  const url = propertyUrl(p, settings.propertyUrlPattern, input);
  if (url) out.propertyUrl = url;

  return out;
}

function buildFeatures(
  p: Property,
  type: string,
  category: IdealistaCategory,
  operationType: 'sale' | 'rent',
  input: BuilderInput,
): Record<string, unknown> | string {
  const f: Record<string, unknown> = { featuresType: type };
  const built = toInt(p.buildSize, 999999);
  const plot = toInt(p.plotSize, 999999999);

  if (category === 'land') {
    if (!plot) return 'No plot size (required for land)';
    f.featuresAreaPlot = plot;
    return f;
  }
  if (!built) return 'No built size';
  f.featuresAreaConstructed = built;
  if (category === 'garage' || category === 'storage') return f;

  const baths = toInt(p.bathrooms, 99);
  const typeName = displayName(input.types.get(p.propertyTypeId ?? -1)?.name);

  if (category === 'homes') {
    if (!baths) return 'No bathrooms';
    f.featuresBathroomNumber = baths;
    const beds = toInt(p.bedrooms, 99);
    const flags = type === 'flat' ? flatFlags(typeName) : {};
    if (beds) f.featuresBedroomNumber = beds;
    else if (type === 'flat' && (p.bedrooms === 0 || flags.featuresStudio)) {
      f.featuresRooms = 1;
      flags.featuresStudio = true;
    } else return 'No bedrooms';
    Object.assign(f, flags);
    if (plot && type !== 'flat') f.featuresAreaPlot = plot;
  } else if (category === 'premises' || category === 'office') {
    if (baths) f.featuresBathroomNumber = baths;
  }

  const year = toInt(p.builtYear);
  if (year && year >= 1000 && year <= 2999) f.featuresBuiltYear = year;

  const rating = energyRating(p.energyRating);
  if (rating) f.featuresEnergyCertificateRating = rating;
  const perf = Number(p.energyConsumption);
  if (rating && ENERGY_RATINGS.includes(rating) && perf > 0 && perf < 10000) {
    f.featuresEnergyCertificatePerformance = Math.round(perf * 100) / 100;
  }

  // Yes/no features from the client's feature names, plus the sizes we hold.
  const names = (p.features || [])
    .map((id) => input.features.get(id))
    .flatMap((row) => (row?.name ? [row.name.en, row.name.es].filter(Boolean) : []))
    .map((n) => n.toLowerCase());
  for (const { key, re, categories } of FEATURE_KEYWORDS) {
    if (categories.includes(category) && names.some((n) => re.test(n))) f[key] = true;
  }
  if (category === 'homes' || category === 'office') {
    for (const n of names) for (const key of orientationKeys(n)) f[key] = true;
  }
  if (category === 'homes') {
    if (toInt(p.terraceSize)) f.featuresTerrace = true;
    if (toInt(p.gardenSize)) f.featuresGarden = true;
    // Furnished is only read for rentals, and only with an equipped kitchen.
    if (operationType !== 'rent' || !f.featuresEquippedKitchen) delete f.featuresEquippedWithFurniture;
  }
  return f;
}

function buildAddress(p: Property, input: BuilderInput): Record<string, unknown> | string {
  const { settings } = input;
  const chain = locationChain(p.locationId, input.locations);
  const a: Record<string, unknown> = {
    addressVisibility: settings.addressVisibility || 'hidden',
  };

  const street = clean(p.street, 200);
  if (street) a.addressStreetName = street;
  const number = clean(p.streetNumber, 10);
  if (street && number) a.addressStreetNumber = number;
  const floor = (p.floor || '').trim().toLowerCase();
  if (/^(-[1-2]|[1-9]|[1-5][0-9]|60|bj|en|ss|st)$/.test(floor)) a.addressFloor = floor;
  const urbanization = clean(p.urbanization, 50) || clean(displayName(chain.find((l) => l.level === 'urbanization')?.name), 50);
  if (urbanization) a.addressUrbanization = urbanization;

  const country = settings.country || 'Spain';
  const postcode = [p.postcode, ...chain.map((l) => l.postcode)].map((c) => (c || '').trim()).find((c) => validPostcode(c, country));
  if (postcode) a.addressPostalCode = postcode;

  const town = chain.find((l) => l.level === 'town' || l.level === 'municipality') ?? chain[0];
  const townName = clean(displayName(town?.name), 50);
  if (townName) a.addressTown = townName;
  a.addressCountry = country;

  if (validCoords(p.lat, p.lng)) {
    a.addressCoordinatesPrecision = 'exact';
    a.addressCoordinatesLatitude = Number(p.lat);
    a.addressCoordinatesLongitude = Number(p.lng);
  } else {
    const withCoords = chain.find((l) => validCoords(l.lat, l.lng));
    if (withCoords) {
      a.addressCoordinatesPrecision = 'moved';
      a.addressCoordinatesLatitude = Number(withCoords.lat);
      a.addressCoordinatesLongitude = Number(withCoords.lng);
    }
  }

  // idealista needs one of: coordinates, postcode, or street + town.
  const ok =
    a.addressCoordinatesLatitude !== undefined ||
    a.addressPostalCode !== undefined ||
    (a.addressStreetName !== undefined && a.addressTown !== undefined);
  return ok ? a : 'No address: needs a postcode or map coordinates (location has neither)';
}

function locationChain(id: number | null, locations: Map<number, LocationRow>): LocationRow[] {
  const chain: LocationRow[] = [];
  const seen = new Set<number>();
  let cur = id != null ? locations.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId != null ? locations.get(cur.parentId) : undefined;
  }
  return chain;
}

function buildDescriptions(description: Record<string, string> | null): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  const used = new Set<string>();
  for (const [code, raw] of Object.entries(description || {})) {
    const language = DESCRIPTION_LANGUAGES[code.toLowerCase().slice(0, 2)];
    const text = htmlToText(raw || '');
    if (!language || !text || used.has(language)) continue;
    used.add(language);
    out.push({ descriptionLanguage: language, descriptionText: cut(text, 4000) });
  }
  return out;
}

function buildContact(s: IdealistaExportSettings): Record<string, string> | null {
  const c: Record<string, string> = {};
  const name = clean(s.contactName, 60);
  if (name) c.contactName = name;
  const email = (s.contactEmail || '').trim();
  if (/^(([a-zA-Z0-9-_.])+)@((?:[a-zA-Z0-9-_]+\.)+)([a-zA-Z]{2,6})$/.test(email)) c.contactEmail = email;
  const phone = splitPhone(s.contactPhone, s.country);
  if (phone) {
    c.contactPrimaryPhonePrefix = phone.prefix;
    c.contactPrimaryPhoneNumber = phone.number;
  }
  return Object.keys(c).length ? c : null;
}

const COUNTRY_PREFIX: Record<string, string> = { Spain: '34', Portugal: '351', Italy: '39' };

export function splitPhone(raw: string | null | undefined, country: string): { prefix: string; number: string } | null {
  const value = (raw || '').trim();
  if (!value) return null;
  const international = value.startsWith('+') || value.startsWith('00');
  let digits = value.replace(/\D/g, '');
  if (value.startsWith('00')) digits = digits.slice(2);
  let prefix = COUNTRY_PREFIX[country] || '34';
  if (international) {
    if (digits.startsWith(prefix)) digits = digits.slice(prefix.length);
    else {
      // Another country's number: take a 2-digit prefix (most of Europe).
      prefix = digits.slice(0, 2);
      digits = digits.slice(2);
    }
  }
  if (!/^[1-9][0-9]{0,2}$/.test(prefix) || !/^[0-9]{5,12}$/.test(digits)) return null;
  return { prefix, number: digits };
}

function propertyUrl(p: Property, pattern: string | undefined, input: BuilderInput): string | null {
  const tpl = (pattern || '').trim();
  if (!tpl || !isHttpUrl(tpl)) return null;
  const segment = propertyUrlSegment(
    {
      reference: p.reference,
      title: p.title?.en || displayName(p.title),
      slug: p.slug,
      location: { name: displayName(input.locations.get(p.locationId ?? -1)?.name) },
      propertyType: { name: displayName(input.types.get(p.propertyTypeId ?? -1)?.name) },
    },
    input.slugFormat,
  );
  const url = tpl.replace(/\{segment\}/g, encodeURI(segment)).replace(/\{ref\}/g, encodeURIComponent(p.reference));
  return isHttpUrl(url) ? url : null;
}

// ---------------------------------------------------------------------------

function toInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null;
}

function clean(value: string | null | undefined, max: number): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

function validCoords(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const la = Number(lat);
  const ln = Number(lng);
  return Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180 && !(la === 0 && ln === 0);
}

function validPostcode(code: string, country: string): boolean {
  if (country === 'Portugal') return /^[0-9]{4}(-[0-9]{3})?$/.test(code);
  return /^[0-9]{5}$/.test(code);
}

function energyRating(raw: string | null): string | null {
  const v = (raw || '').trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (ENERGY_RATINGS.includes(upper)) return upper;
  if (/exempt|exento/i.test(v)) return 'exempt';
  if (/process|tr[aá]mite/i.test(v)) return 'inProcess';
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const space = slice.lastIndexOf(' ');
  return (space > max - 200 ? slice.slice(0, space) : slice).trimEnd() + '…';
}

function sendDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
