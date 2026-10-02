import { distanceKm, maxKmFrom } from '../location/location-points';
import { checkCoords } from './template-coords';

// Filling in the points and postcodes the template is missing, without a
// person typing them. OpenStreetMap's geocoder (Nominatim) is asked first: it
// knows where a place really is. What it can't find goes to the AI, whose
// answers are guesses and are held to the same checks. Nothing filled here is
// "confirmed": it shows as auto-filled until a person accepts or corrects it,
// and the whole run can be undone (see TemplateAutoFillService).

export type AutoFillSource = 'map' | 'ai';

// Stored on the node (LocationTemplateNode.autoFill): what was filled, so undo
// clears exactly that and nothing a person entered since.
export interface AutoFillRecord {
  tried: true;
  at: string;
  lat?: number;
  lng?: number;
  coordsSource?: AutoFillSource;
  postcode?: string;
  postcodeSource?: AutoFillSource;
  // What could not be filled, and why.
  problem?: string;
}

export interface FillNode {
  id: number;
  parentId: number | null;
  level: string;
  name: string;
  lat: number | string | null;
  lng: number | string | null;
  postcode: string | null;
}

export interface Anchor {
  lat: number;
  lng: number;
  level: string;
  name: string;
}

export const FILL_LEVELS = ['municipality', 'town', 'urbanization'];

export const hasCoords = (n: FillNode) => checkCoords(n.lat, n.lng).ok;
export const hasPostcode = (n: FillNode) => !!n.postcode && /^\d{5}$/.test(n.postcode);

/** Ancestors, nearest first. */
export function ancestorsOf(n: FillNode, byId: Map<number, FillNode>): FillNode[] {
  const out: FillNode[] = [];
  const seen = new Set<number>([n.id]);
  let cur = n.parentId != null ? byId.get(n.parentId) : undefined;
  while (cur && !seen.has(cur.id)) {
    out.push(cur);
    seen.add(cur.id);
    cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** The nearest ancestor with a usable point: what a new point is checked against. */
export function anchorOf(n: FillNode, byId: Map<number, FillNode>): Anchor | null {
  for (const a of ancestorsOf(n, byId)) {
    const c = checkCoords(a.lat, a.lng);
    if (c.ok) return { lat: c.lat, lng: c.lng, level: a.level, name: a.name };
  }
  return null;
}

/**
 * Geocoder queries, most specific first. Areas ("Costa del Sol West") and
 * regions aren't names a map knows, so only municipality/town and province go
 * in: "El Rosario, Marbella, Málaga, Spain", then "El Rosario, Málaga, Spain".
 */
export function queriesFor(n: FillNode, byId: Map<number, FillNode>): string[] {
  const up = ancestorsOf(n, byId);
  const local = up.filter((a) => a.level === 'municipality' || a.level === 'town').map((a) => a.name);
  const province = up.find((a) => a.level === 'province')?.name;
  const tail = [province, 'Spain'].filter(Boolean) as string[];
  const queries = [[n.name, ...local, ...tail].join(', ')];
  if (local.length) queries.push([n.name, ...tail].join(', '));
  return [...new Set(queries)];
}

/** Null when the point is fine; otherwise why it was refused. */
export function pointProblem(lat: number, lng: number, anchor: Anchor | null): string | null {
  const c = checkCoords(lat, lng);
  if (!c.ok) return c.problem || 'no point';
  if (!anchor) return null;
  const km = distanceKm(c.lat, c.lng, anchor.lat, anchor.lng);
  const limit = maxKmFrom(anchor.level);
  return km > limit ? `${Math.round(km)} km from ${anchor.name} (limit ${limit} km)` : null;
}

export interface GeocoderHit {
  lat?: string;
  lon?: string;
  address?: { postcode?: string };
}

/** The first geocoder result that passes the checks. */
export function pickHit(
  hits: GeocoderHit[],
  anchor: Anchor | null,
): { lat: number; lng: number; postcode: string | null } | { problem: string } {
  let problem = 'not found on the map';
  for (const h of hits) {
    const lat = Number(h.lat);
    const lng = Number(h.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const p = pointProblem(lat, lng, anchor);
    if (p) {
      problem = `map result refused: ${p}`;
      continue;
    }
    const c = checkCoords(lat, lng) as { ok: true; lat: number; lng: number };
    return { lat: c.lat, lng: c.lng, postcode: cleanPostcode(h.address?.postcode) };
  }
  return { problem };
}

/** "29600", "29600;29610", "29600-29610" → "29600"; anything else → null. */
export function cleanPostcode(raw: unknown): string | null {
  const m = String(raw ?? '').match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

/**
 * Spanish postcodes start with the province's two-digit code (29 Málaga, 03
 * Alicante). The prefix the province's known postcodes mostly use is the one a
 * new postcode must have; with none known yet, any five digits pass.
 */
export function postcodeProblem(postcode: string, provincePrefix: string | null): string | null {
  if (!/^\d{5}$/.test(postcode)) return `postcode "${postcode}" is not five digits`;
  if (provincePrefix && postcode.slice(0, 2) !== provincePrefix) {
    return `postcode ${postcode} is not in this province (${provincePrefix}xxx)`;
  }
  return null;
}

/** Most common postcode prefix per province node id. */
export function provincePrefixes(nodes: FillNode[], byId: Map<number, FillNode>): Map<number, string> {
  const counts = new Map<number, Map<string, number>>();
  for (const n of nodes) {
    if (!hasPostcode(n)) continue;
    const province = provinceOf(n, byId);
    if (!province) continue;
    const m = counts.get(province.id) || new Map<string, number>();
    const prefix = n.postcode!.slice(0, 2);
    m.set(prefix, (m.get(prefix) || 0) + 1);
    counts.set(province.id, m);
  }
  const out = new Map<number, string>();
  for (const [id, m] of counts) {
    out.set(id, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return out;
}

export function provinceOf(n: FillNode, byId: Map<number, FillNode>): FillNode | undefined {
  if (n.level === 'province') return n;
  return ancestorsOf(n, byId).find((a) => a.level === 'province');
}

export interface AiQuestion {
  node: FillNode;
  path: string;
  needCoords: boolean;
  needPostcode: boolean;
}

export function buildFillPrompt(questions: AiQuestion[]): string {
  const lines = questions.map((q, i) => {
    const want = [q.needCoords && 'lat/lng', q.needPostcode && 'postcode'].filter(Boolean).join(' + ');
    return `${i + 1}. ${q.node.name} [${q.node.level}] — ${q.path} — need: ${want}`;
  });
  return `These are real places in Spain (municipalities, towns, districts, urbanizations) from a property-listing location list.
For each numbered place give its centre point (WGS84 decimal degrees) and/or its main 5-digit Spanish postcode, as asked.
Only answer what you actually know. If you are not confident about a place, use null for that value — a wrong value is worse than none.

${lines.join('\n')}

Reply ONLY with JSON: {"1": {"lat": 36.5101, "lng": -4.8824, "postcode": "29660"}, "2": {"lat": null, "lng": null, "postcode": "29600"}, "3": null, ...}`;
}

/** The AI's values for each question, before the checks. */
export function readFillAnswers(
  questions: AiQuestion[],
  answer: Record<string, unknown>,
): Map<number, { lat: number | null; lng: number | null; postcode: string | null }> {
  const out = new Map<number, { lat: number | null; lng: number | null; postcode: string | null }>();
  questions.forEach((q, i) => {
    const raw = answer[String(i + 1)] as { lat?: unknown; lng?: unknown; postcode?: unknown } | null | undefined;
    if (!raw || typeof raw !== 'object') return;
    const lat = q.needCoords && raw.lat != null && raw.lat !== '' ? Number(raw.lat) : NaN;
    const lng = q.needCoords && raw.lng != null && raw.lng !== '' ? Number(raw.lng) : NaN;
    const coordsOk = Number.isFinite(lat) && Number.isFinite(lng);
    out.set(q.node.id, {
      lat: coordsOk ? lat : null,
      lng: coordsOk ? lng : null,
      postcode: q.needPostcode ? cleanPostcode(raw.postcode) : null,
    });
  });
  return out;
}
