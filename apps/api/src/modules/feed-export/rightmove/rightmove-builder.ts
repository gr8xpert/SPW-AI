// Builds one Rightmove OverseasSendProperty request per listing. Pure: the
// sync service loads the rows, this only maps them. A listing Rightmove would
// reject (or must not show) is skipped with a reason; one that is sent but
// loses something gets issues.

import { createHash } from 'crypto';
import type { Property, RightmoveExportSettings } from '../../../database/entities';
import { displayName, htmlToText } from '../idealista/idealista-builder';
import {
  AREA_UNIT_SQM,
  FEATURE_FLAGS,
  MEDIA_TYPE,
  OS_STATUS,
  guessRightmoveType,
  isRightmoveType,
} from './rightmove-catalog';

export interface RmTypeRow {
  id: number;
  parentId: number | null;
  name: Record<string, string> | null;
  rightmoveType: string | null;
}

export interface RmLocationRow {
  id: number;
  parentId: number | null;
  level: string;
  name: Record<string, string> | null;
  rightmoveLocationId: number | null;
}

export interface RmPlace {
  id: number;
  region: string;
  subRegion: string | null;
  town: string | null;
  townKey: string;
}

// Rightmove's place list, indexed for lookup.
export interface RmGazetteer {
  byId: Map<number, RmPlace>;
  byTownKey: Map<string, RmPlace[]>;
  size: number;
}

export interface RmContext {
  settings: RightmoveExportSettings;
  types: Map<number, RmTypeRow>;
  locations: Map<number, RmLocationRow>;
  features: Map<number, { id: number; name: Record<string, string> | null }>;
  gazetteer: RmGazetteer;
}

export type RmTypeSource = 'set' | 'parent' | 'guess';

export interface RmBuilt {
  agentRef: string;
  payload: Record<string, unknown>;
  // Stable across runs while the listing is unchanged (update_date left out).
  hash: string;
  issues: string[];
}

export interface RmSkipped {
  agentRef: string;
  reason: string;
}

export const SUMMARY_MAX = 300;
const DESCRIPTION_MAX = 32000;
const MAX_MEDIA = 999;
const MAX_FEATURES = 10;

export function emptyGazetteer(): RmGazetteer {
  return { byId: new Map(), byTownKey: new Map(), size: 0 };
}

export function indexGazetteer(rows: RmPlace[]): RmGazetteer {
  const g = emptyGazetteer();
  for (const r of rows) {
    g.byId.set(r.id, r);
    const list = g.byTownKey.get(r.townKey);
    if (list) list.push(r);
    else g.byTownKey.set(r.townKey, [r]);
  }
  g.size = rows.length;
  return g;
}

// "Benalmádena Costa" → "benalmadena costa"
export function placeKey(name: string | null | undefined): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// The Rightmove type a property type is sent as: its own setting, else the
// nearest parent's, else a guess from its name (then its parents' names).
export function resolveRightmoveType(
  typeId: number | null,
  types: Map<number, RmTypeRow>,
): { value: string | null; source: RmTypeSource | null } {
  const chain: RmTypeRow[] = [];
  const seen = new Set<number>();
  let cur = typeId != null ? types.get(typeId) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId != null ? types.get(cur.parentId) : undefined;
  }
  for (let i = 0; i < chain.length; i++) {
    if (isRightmoveType(chain[i].rightmoveType)) {
      return { value: chain[i].rightmoveType, source: i === 0 ? 'set' : 'parent' };
    }
  }
  const names = chain.flatMap((t) => [t.name?.en, t.name?.es, ...Object.values(t.name || {})]);
  const guess = guessRightmoveType(...names);
  return guess ? { value: guess, source: 'guess' } : { value: null, source: null };
}

// The Rightmove place for a location: a hand-set link on it or a parent,
// else the first name in the chain Rightmove knows. Null when none match.
export function resolvePlace(
  locationId: number | null,
  ctx: Pick<RmContext, 'locations' | 'gazetteer'>,
): { place: RmPlace | null; tried: string } {
  const chain = locationChain(locationId, ctx.locations);
  const tried = displayName(chain.find((l) => l.level === 'town' || l.level === 'municipality')?.name ?? chain[0]?.name);
  const parentKeys = new Set(chain.map((l) => placeKey(displayName(l.name))));
  for (const loc of chain) {
    if (loc.rightmoveLocationId != null) {
      const linked = ctx.gazetteer.byId.get(loc.rightmoveLocationId);
      if (linked) return { place: linked, tried };
    }
    if (loc.level === 'region' || loc.level === 'province') continue;
    for (const lang of [loc.name?.en, loc.name?.es, ...Object.values(loc.name || {})]) {
      const candidates = ctx.gazetteer.byTownKey.get(placeKey(lang));
      if (!candidates?.length) continue;
      // Same town name in two regions: take the one whose region or
      // sub-region is also in the listing's location chain.
      const best =
        candidates.find((c) => parentKeys.has(placeKey(c.subRegion)) || parentKeys.has(placeKey(c.region))) ??
        candidates[0];
      return { place: best, tried };
    }
  }
  return { place: null, tried };
}

export function buildRightmoveProperty(p: Property, ctx: RmContext): RmBuilt | RmSkipped {
  const agentRef = (p.reference || '').trim().slice(0, 80);
  const skip = (reason: string): RmSkipped => ({ agentRef, reason });
  if (!agentRef) return skip('No reference');

  if (p.listingType !== 'sale' && p.listingType !== 'development') {
    return skip('Rentals are not allowed on Rightmove Overseas (sales only)');
  }
  if (p.priceOnRequest) return skip('Price on request is not allowed on Rightmove');
  const price = toInt(p.price);
  if (!price) return skip('No price');
  if ((p.currency || 'EUR').toUpperCase() !== 'EUR') return skip(`Price is in ${p.currency} — Rightmove wants euros for Spain`);

  const { value: type } = resolveRightmoveType(p.propertyTypeId, ctx.types);
  if (!type) return skip('Property type has no Rightmove type — set it under Feed Export → Rightmove → Property types');

  const english = cleanText(htmlToText(p.description?.en || ''));
  if (!english) return skip('No English description (Rightmove needs English first)');

  const issues: string[] = [];

  let description = english;
  if (ctx.settings.includeSpanish) {
    const spanish = cleanText(htmlToText(p.description?.es || ''));
    if (spanish) description = `${english}\n\n${spanish}`;
    else issues.push('No Spanish description — sent in English only');
  }
  if (description.length > DESCRIPTION_MAX) {
    description = cut(description, DESCRIPTION_MAX);
    issues.push('Description is longer than 32,000 characters and is cut off');
  }

  const address = buildAddress(p, ctx, issues);
  const details = buildDetails(p, ctx, english, description, type);
  const media = buildMedia(p);
  if (!media.some((m) => m.media_type === MEDIA_TYPE.image)) issues.push('No photos');

  const property: Record<string, unknown> = {
    agent_ref: agentRef,
    published: true,
    property_type: Number(type),
    os_status: OS_STATUS.available,
    new_home: p.listingType === 'development',
    create_date: rmDate(p.createdAt),
    address,
    price_information: { price },
    details,
    media,
  };

  const payload = {
    network: { network_id: ctx.settings.networkId },
    branch: { branch_id: ctx.settings.branchId },
    property,
  };
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  // update_date goes in after hashing: it changes on every save, the hash
  // must only change when what Rightmove shows changes.
  property.update_date = rmDate(p.updatedAt);
  return { agentRef, payload, hash, issues };
}

export function isSkipped(r: RmBuilt | RmSkipped): r is RmSkipped {
  return 'reason' in r;
}

// ---------------------------------------------------------------------------

function buildAddress(p: Property, ctx: RmContext, issues: string[]): Record<string, unknown> {
  const a: Record<string, unknown> = { country_code: 'ES' };
  const { place, tried } = resolvePlace(p.locationId, ctx);
  if (place) {
    a.region = place.region;
    if (place.subRegion) a.sub_region = place.subRegion;
    if (place.town) a.town_city = place.town;
  } else if (!ctx.gazetteer.size) {
    // No place list loaded yet: send our own names.
    const chain = locationChain(p.locationId, ctx.locations);
    const name = (level: string[]) => displayName(chain.find((l) => level.includes(l.level))?.name);
    const region = name(['region']);
    const sub = name(['province']);
    const town = name(['town', 'municipality']) || p.feedLocation?.town || '';
    if (region) a.region = region;
    if (sub) a.sub_region = sub;
    if (town) a.town_city = town;
    issues.push("Rightmove's place list isn't loaded yet — the town is sent as named and may not match");
  } else {
    const label = tried || p.feedLocation?.town || 'The location';
    issues.push(`"${label}" is not in Rightmove's place list — choose it under Feed Export → Rightmove → Towns`);
  }
  if (validCoords(p.lat, p.lng)) {
    a.latitude = Number(p.lat);
    a.longitude = Number(p.lng);
  }
  return a;
}

function buildDetails(
  p: Property,
  ctx: RmContext,
  english: string,
  description: string,
  type: string,
): Record<string, unknown> {
  const d: Record<string, unknown> = {
    summary: cut(english.replace(/\s+/g, ' '), SUMMARY_MAX),
    description,
    bedrooms: toInt(p.bedrooms, 99) ?? 0,
  };
  const baths = toInt(p.bathrooms, 99);
  if (baths) d.bathrooms = baths;
  const built = toInt(p.buildSize, 999999);
  if (built) {
    d.internal_area = built;
    d.internal_area_unit = AREA_UNIT_SQM;
  }
  const plot = toInt(p.plotSize, 999999999);
  // A flat's plot is the whole development's — not shown for flats.
  if (plot && !['28', '8', '7', '9', '29', '56', '59'].includes(type)) {
    d.land_area = plot;
    d.land_area_unit = AREA_UNIT_SQM;
  }
  const year = toInt(p.builtYear);
  if (year && year >= 1000 && year <= 2999) d.year_built = year;

  const names = (p.features || [])
    .map((id) => ctx.features.get(id)?.name)
    .filter((n): n is Record<string, string> => !!n);
  const lower = names.flatMap((n) => [n.en, n.es].filter(Boolean)).map((n) => n.toLowerCase());
  for (const { key, re } of FEATURE_FLAGS) if (lower.some((n) => re.test(n))) d[key] = true;
  if (toInt(p.terraceSize) && !d.roof_terrace && !d.balcony) d.ground_floor_terrace = true;

  const features = [...new Set(names.map((n) => cleanText(n.en || '').slice(0, 200)).filter(Boolean))].slice(0, MAX_FEATURES);
  if (features.length) d.features = features;
  return d;
}

function buildMedia(p: Property): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const stamp = rmDate(p.createdAt);
  const add = (media_type: number, url: string | null | undefined, caption?: string) => {
    const u = (url || '').trim();
    if (!isHttpUrl(u) || u.length > 250 || seen.has(u) || out.length >= MAX_MEDIA) return;
    seen.add(u);
    const m: Record<string, unknown> = { media_type, media_url: u, sort_order: out.length + 1 };
    if (caption) m.caption = caption.slice(0, 50);
    // Image URLs change when the image does, so the listing's creation date
    // lets Rightmove skip downloading photos it already has.
    if (stamp) m.media_update_date = stamp;
    out.push(m);
  };
  for (const img of [...(p.images || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) add(MEDIA_TYPE.image, img.url);
  for (const plan of p.floorPlans || []) add(MEDIA_TYPE.floorplan, plan.url, plan.label);
  if (p.floorPlanUrl) add(MEDIA_TYPE.floorplan, p.floorPlanUrl);
  if (p.virtualTourUrl) add(MEDIA_TYPE.virtualTour, p.virtualTourUrl);
  return out;
}

function locationChain(id: number | null, locations: Map<number, RmLocationRow>): RmLocationRow[] {
  const chain: RmLocationRow[] = [];
  const seen = new Set<number>();
  let cur = id != null ? locations.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.push(cur);
    cur = cur.parentId != null ? locations.get(cur.parentId) : undefined;
  }
  return chain;
}

// Rightmove removes listings whose text carries contact details or links.
export function cleanText(text: string): string {
  return text
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
    // International numbers: +34 600 123 456, 0044 20 1234 5678
    .replace(/(?:\+|\b00)\d{1,3}[\s.-]?(?:\(?\d+\)?[\s.-]?){2,5}\d{2,}/g, '')
    // Spanish 9-digit phones, but not prices ("600 000 €")
    .replace(/\b[6789]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b(?!\s*(?:€|eur|euro))/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const space = slice.lastIndexOf(' ');
  return (space > max - 60 ? slice.slice(0, space) : slice).trimEnd() + '…';
}

function toInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null;
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

// Rightmove's timestamp format: dd-MM-yyyy HH:mm:ss (UTC).
export function rmDate(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}
