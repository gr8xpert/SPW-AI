import { checkCoords } from './template-coords';
import { locationKey, levelIndex, TemplateLevel } from './location-name';

// Pure matching logic, kept free of the database so it can be tested on its own.

export interface TemplateNodeLite {
  id: number;
  parentId: number | null;
  level: TemplateLevel;
  name: string;
  nameKey: string;
  aliases: string[] | null;
  status: 'ok' | 'needs_review' | 'ai_suggested';
  lat?: number | string | null;
  lng?: number | string | null;
}

export interface FeedLocationInput {
  province?: string | null;
  area?: string | null;
  municipality?: string | null;
  town?: string | null;
  urbanization?: string | null;
}

export interface LocationResolution {
  // Deepest template node the listing belongs to.
  anchor: TemplateNodeLite;
  // Names the template doesn't know, placed below the anchor as the feed sent
  // them (most general first).
  extras: Array<{ name: string; level: TemplateLevel }>;
  // Set when a name had to go in as an extra — recorded for Super Admin.
  unmatched: { name: string; subName: string | null } | null;
}

// Levels a feed's place names can match. Region/province/area come from the
// feed's own province/area fields.
const PLACE_LEVELS: TemplateLevel[] = ['town', 'urbanization', 'municipality'];

export class TemplateIndex {
  readonly byId = new Map<number, TemplateNodeLite>();
  private readonly byKey = new Map<string, TemplateNodeLite[]>();

  constructor(nodes: TemplateNodeLite[]) {
    for (const n of nodes) this.byId.set(n.id, n);
    for (const n of nodes) {
      const keys = new Set([n.nameKey || locationKey(n.name), ...(n.aliases || []).map(locationKey)]);
      for (const k of keys) {
        if (!k) continue;
        const list = this.byKey.get(k);
        if (list) list.push(n);
        else this.byKey.set(k, [n]);
      }
    }
  }

  get size(): number {
    return this.byId.size;
  }

  find(name: string | null | undefined, levels?: TemplateLevel[]): TemplateNodeLite[] {
    const list = this.byKey.get(locationKey(name)) || [];
    return levels ? list.filter((n) => levels.includes(n.level)) : list;
  }

  // Root first, the node itself last.
  path(node: TemplateNodeLite): TemplateNodeLite[] {
    const out: TemplateNodeLite[] = [];
    let cur: TemplateNodeLite | undefined = node;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parentId != null ? this.byId.get(cur.parentId) : undefined;
    }
    return out;
  }

  ancestor(node: TemplateNodeLite, level: TemplateLevel): TemplateNodeLite | undefined {
    return this.path(node).find((n) => n.level === level);
  }

  isUnder(node: TemplateNodeLite, ancestor: TemplateNodeLite): boolean {
    return this.path(node).some((n) => n.id === ancestor.id);
  }

  // A point that stands for the place on a map: its own coordinates, else the
  // centre of the places inside it that have some (a municipality from its
  // towns), else its parent's. Only municipality level and below; null when
  // nothing that close has a point.
  private readonly coordsMemo = new Map<number, { lat: number; lng: number } | null>();
  private childrenOf: Map<number, TemplateNodeLite[]> | null = null;
  coords(node: TemplateNodeLite): { lat: number; lng: number } | null {
    if (this.coordsMemo.has(node.id)) return this.coordsMemo.get(node.id)!;
    // A region, province or area is too big to pin a listing on.
    if (node.level === 'region' || node.level === 'province' || node.level === 'area') {
      this.coordsMemo.set(node.id, null);
      return null;
    }
    const checked = checkCoords(node.lat, node.lng);
    const own = checked.ok ? { lat: checked.lat, lng: checked.lng } : null;
    let result = own;
    if (!result) {
      const inside = this.pointsInside(node);
      if (inside.length) {
        result = {
          lat: inside.reduce((s, p) => s + p.lat, 0) / inside.length,
          lng: inside.reduce((s, p) => s + p.lng, 0) / inside.length,
        };
      }
    }
    if (!result && node.parentId != null) {
      const parent = this.byId.get(node.parentId);
      if (parent) result = this.coords(parent);
    }
    this.coordsMemo.set(node.id, result);
    return result;
  }

  private pointsInside(node: TemplateNodeLite): Array<{ lat: number; lng: number }> {
    if (!this.childrenOf) {
      this.childrenOf = new Map();
      for (const n of this.byId.values()) {
        if (n.parentId == null) continue;
        const list = this.childrenOf.get(n.parentId) || [];
        list.push(n);
        this.childrenOf.set(n.parentId, list);
      }
    }
    const out: Array<{ lat: number; lng: number }> = [];
    const stack = [...(this.childrenOf.get(node.id) || [])];
    while (stack.length) {
      const n = stack.pop()!;
      const c = checkCoords(n.lat, n.lng);
      if (c.ok) out.push({ lat: c.lat, lng: c.lng });
      stack.push(...(this.childrenOf.get(n.id) || []));
    }
    return out;
  }
}

export function validCoords(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat);
  const b = Number(lng);
  if (lat == null || lng == null || !Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: a, lng: b };
}

const levelPreference = (level: TemplateLevel) => PLACE_LEVELS.indexOf(level);
const statusPreference = (status: TemplateNodeLite['status']) => (status === 'ok' ? 0 : status === 'ai_suggested' ? 1 : 2);

// Finds where a feed location belongs in the template.
//
// The feed's place names are tried from the most specific (urbanization) to the
// most general (municipality); the first that the template knows — within the
// feed's province, and preferring the feed's area — becomes the anchor. Names
// more specific than the anchor that the template doesn't know are kept as
// extras below it. With no name matched, the listing is anchored at the feed's
// area (or province) and its names become extras. Returns null only when not
// even the province/area is in the template, so the caller can fall back to
// building the tree from the feed's names as before.
export function resolveLocation(index: TemplateIndex, loc: FeedLocationInput): LocationResolution | null {
  const provinceNode = pickOne(index.find(loc.province, ['province']));
  let areaNode = pickOne(
    index.find(loc.area, ['area']).filter((a) => !provinceNode || index.isUnder(a, provinceNode)),
  );
  // "Málaga" arrives as an area as well as a province from some feeds.
  if (areaNode && provinceNode && areaNode.id === provinceNode.id) areaNode = undefined;

  const names: Array<{ name: string; level: TemplateLevel }> = [];
  for (const [raw, level] of [
    [loc.urbanization, 'urbanization'],
    [loc.town, 'town'],
    [loc.municipality, 'municipality'],
  ] as Array<[string | null | undefined, TemplateLevel]>) {
    const name = (raw || '').trim();
    if (!name) continue;
    // Skip a name repeating one already listed or the area/province itself.
    const k = locationKey(name);
    if (names.some((n) => locationKey(n.name) === k)) continue;
    if (k === locationKey(loc.area) || k === locationKey(loc.province)) continue;
    names.push({ name, level });
  }

  for (let i = 0; i < names.length; i++) {
    let candidates = index.find(names[i].name, PLACE_LEVELS);
    if (candidates.length === 0) continue;

    if (provinceNode) {
      candidates = candidates.filter((c) => index.isUnder(c, provinceNode));
    } else if (loc.province || !areaNode) {
      // Province unknown to the template (or not sent at all): a bare name is
      // only trusted when it is unique — "El Chaparral" exists in Mijas and in
      // Torrevieja.
      if (new Set(candidates.map((c) => index.ancestor(c, 'municipality')?.id ?? c.id)).size > 1) continue;
    }
    if (areaNode) {
      const inArea = candidates.filter((c) => index.isUnder(c, areaNode!));
      if (inArea.length) candidates = inArea;
    }
    if (candidates.length === 0) continue;

    // Same level as the feed gave the name first (a feed's municipality
    // "Mijas" is the municipality, its town "Mijas" the town), then towns.
    const asSent = names[i].level;
    candidates.sort(
      (a, b) =>
        Number(b.level === asSent) - Number(a.level === asSent) ||
        levelPreference(a.level) - levelPreference(b.level) ||
        statusPreference(a.status) - statusPreference(b.status) ||
        a.id - b.id,
    );
    const anchor = candidates[0];
    const extras = extrasBelow(anchor, names.slice(0, i).reverse());
    return {
      anchor,
      extras,
      unmatched: extras.length ? { name: extras[0].name, subName: extras[1]?.name ?? null } : null,
    };
  }

  const fallback = areaNode || provinceNode;
  if (!fallback) return null;
  const extras = extrasBelow(fallback, [...names].reverse());
  return {
    anchor: fallback,
    extras,
    unmatched: extras.length ? { name: extras[0].name, subName: extras[1]?.name ?? null } : null,
  };
}

// Unknown names under an anchor, most general first, each at least one level
// deeper than whatever sits above it.
function extrasBelow(
  anchor: TemplateNodeLite,
  generalToSpecific: Array<{ name: string; level: TemplateLevel }>,
): Array<{ name: string; level: TemplateLevel }> {
  const out: Array<{ name: string; level: TemplateLevel }> = [];
  let depth = levelIndex(anchor.level);
  for (const n of generalToSpecific) {
    if (locationKey(n.name) === anchor.nameKey) continue;
    let level = Math.max(levelIndex(n.level), depth + 1);
    if (level > levelIndex('urbanization')) break;
    // An urbanization only ever sits inside a town. Without a town above it
    // (ADSUBIA under the province) the name is shown as a town until someone
    // places it, never as an urbanization skipping the levels in between.
    if (level === levelIndex('urbanization') && depth !== levelIndex('town')) level = levelIndex('town');
    const name = n.name.trim();
    out.push({ name, level: (['region', 'province', 'area', 'municipality', 'town', 'urbanization'] as const)[level] });
    depth = level;
  }
  return out;
}

function pickOne(nodes: TemplateNodeLite[]): TemplateNodeLite | undefined {
  return [...nodes].sort((a, b) => statusPreference(a.status) - statusPreference(b.status) || a.id - b.id)[0];
}
