import { distanceKm } from '../location/location-points';

// Checks on the coordinates the template hands to every client's map. A town's
// point is where all of its listings are drawn (feeds send no GPS per listing),
// so one wrong value moves a whole town. A value that fails is never used: it is
// cleared and the reason kept in the node's note, for a person to correct.

// Mainland Spain, the Balearics and the Canaries, with a little margin.
const SPAIN = { minLat: 27.4, maxLat: 44.1, minLng: -18.6, maxLng: 4.7 };

const inSpain = (lat: number, lng: number) =>
  lat >= SPAIN.minLat && lat <= SPAIN.maxLat && lng >= SPAIN.minLng && lng <= SPAIN.maxLng;

export type CoordCheck =
  | { ok: true; lat: number; lng: number }
  | { ok: false; problem: string | null };

// problem === null: there simply is no value (blank or 0,0) — nothing to report.
export function checkCoords(rawLat: unknown, rawLng: unknown): CoordCheck {
  const blank = (v: unknown) => v == null || String(v).trim() === '';
  if (blank(rawLat) || blank(rawLng)) return { ok: false, problem: null };
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, problem: `not numbers (${rawLat}, ${rawLng})` };
  if (lat === 0 && lng === 0) return { ok: false, problem: null };
  if (lat === 0 || lng === 0) return { ok: false, problem: `one of latitude/longitude is 0 (${lat}, ${lng})` };
  if (inSpain(lat, lng)) return { ok: true, lat: round7(lat), lng: round7(lng) };
  if (inSpain(lng, lat)) return { ok: false, problem: `latitude and longitude look swapped (${lat}, ${lng})` };
  return { ok: false, problem: `outside Spain (${lat}, ${lng})` };
}

const round7 = (n: number) => Number(n.toFixed(7));

// Spanish postcodes are five digits; spreadsheets drop the leading zero of
// Alicante (03…) and the Balearics (07…).
export function normalizePostcode(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return `0${s}`;
  if (/^\d{4}\.0+$/.test(s)) return `0${s.split('.')[0]}`;
  if (/^\d{5}\.0+$/.test(s)) return s.split('.')[0];
  return s.slice(0, 20);
}

export interface CoordNode {
  id: number;
  parentId: number | null;
  level: string;
  name: string;
  lat: number | string | null;
  lng: number | string | null;
  coordsConfirmed?: boolean;
}

// Places whose point is far from the other places of the same municipality:
// "Los Alamos, Torremolinos" filed 200 km away in Granada, or "Torremar,
// Benalmádena" on the far side of Málaga. Measured against the median of the
// group, and the allowance scales with how spread out that municipality's
// places are, so large municipalities (Murcia, Marbella) aren't flagged for
// being large. Needs three or more placed siblings to judge anything.
// Suburbs of a city municipality (Churriana, El Olivar in Málaga) sit 8-10 km
// from its middle and are right.
const MIN_ALLOWANCE_KM = 12;

export function findOutliers(nodes: CoordNode[]): Array<{ id: number; problem: string }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const municipalityOf = (n: CoordNode): CoordNode | undefined => {
    let cur = n.parentId != null ? byId.get(n.parentId) : undefined;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.level === 'municipality') return cur;
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };

  const groups = new Map<number, Array<{ node: CoordNode; lat: number; lng: number }>>();
  for (const n of nodes) {
    if (n.level !== 'town' && n.level !== 'urbanization') continue;
    const c = checkCoords(n.lat, n.lng);
    if (!c.ok) continue;
    const m = municipalityOf(n);
    if (!m) continue;
    const list = groups.get(m.id) || [];
    list.push({ node: n, lat: c.lat, lng: c.lng });
    groups.set(m.id, list);
  }

  const out: Array<{ id: number; problem: string }> = [];
  for (const [mId, list] of groups) {
    if (list.length < 3) continue;
    const mLat = median(list.map((p) => p.lat));
    const mLng = median(list.map((p) => p.lng));
    const dists = list.map((p) => distanceKm(p.lat, p.lng, mLat, mLng));
    const limit = Math.max(MIN_ALLOWANCE_KM, 3 * median(dists));
    list.forEach((p, i) => {
      if (dists[i] <= limit || p.node.coordsConfirmed) return;
      out.push({
        id: p.node.id,
        problem: `${Math.round(dists[i])} km from the other places of ${byId.get(mId)!.name} (${p.lat}, ${p.lng})`,
      });
    });
  }
  return out;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export const COORD_NOTE_PREFIX = 'Coordinates removed: ';
