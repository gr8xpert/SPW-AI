import { distanceKm } from '../location/location-points';
import { locationKey } from './location-name';
import { TemplateIndex, TemplateNodeLite, validCoords } from './location-template.resolver';

// AI review of "Unmatched from feeds": for each place name a feed sent that the
// template doesn't know, the model is shown real template places it could be
// and answers one of
//   same     — another spelling of a listed place (ADSUBIA → L'Atzúbia)
//   new      — a real town/urbanization not in the template, inside a listed
//              municipality
//   dismiss  — not a place at all ("Rural location", "Inland")
//   null     — not sure
// It can only point at places it was shown, and every answer is checked
// against where the listings actually are before anyone relies on it.

// Farther than this from the listings' average position, a suggestion is
// flagged instead of trusted.
export const MAX_PROPOSAL_KM = 10;

export interface ReviewEntry {
  id: number;
  name: string;
  subName: string | null;
  placedUnderNodeId: number | null;
  lat: number | string | null;
  lng: number | string | null;
}

export interface ReviewCandidate {
  label: string; // P1… for places, M1… for municipalities
  node: TemplateNodeLite;
}

export interface ReviewQuestion {
  entry: ReviewEntry;
  anchor: TemplateNodeLite;
  places: ReviewCandidate[];
  municipalities: ReviewCandidate[];
}

export interface AiProposal {
  action: 'same' | 'new' | 'dismiss' | null;
  nodeId?: number; // same: the place; new: the municipality
  target?: string; // its path, for display
  reason?: string;
  km?: number | null; // listings' position to the place (null = no GPS)
  flagged?: boolean; // farther than MAX_PROPOSAL_KM
  at: string;
}

const ARTICLES = /^(l|la|el|les|els|los|las|lo|sa|ses|es|s|d)\s+/;

// "L'Atzúbia" / "Atzúbia" / "ADSUBIA" → "atzubia" / "atzubia" / "adsubia":
// articles and spaces gone, and the letters Spanish and Valencian spellings
// swap most often folded together.
export function looseKey(name: string): string {
  return locationKey(name)
    .replace(ARTICLES, '')
    .replace(/\s+/g, '')
    .replace(/tz|ds|dz|ts/g, 's')
    .replace(/[vb]/g, 'b')
    .replace(/ll|y/g, 'i')
    .replace(/ix|x/g, 'j')
    .replace(/h/g, '');
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const x = looseKey(a);
  const y = looseKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return 0.85;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

export function entryPoint(entry: Pick<ReviewEntry, 'lat' | 'lng'>): { lat: number; lng: number } | null {
  return validCoords(entry.lat, entry.lng);
}

/**
 * The places shown to the model for one entry: similar spellings anywhere in
 * the province (or the area/municipality the feed reached), places near the
 * listings, and the municipalities a new town could belong to.
 */
export function buildQuestion(index: TemplateIndex, entry: ReviewEntry): ReviewQuestion | null {
  const anchor = entry.placedUnderNodeId != null ? index.byId.get(entry.placedUnderNodeId) : undefined;
  if (!anchor) return null;
  // Search the whole province: feeds often send an area the template files
  // differently (ADSUBIA arrived under Alicante with no usable area).
  const scope = index.ancestor(anchor, 'province') ?? anchor;
  const pool = [...index.byId.values()].filter(
    (n) => (n.level === 'municipality' || n.level === 'town' || n.level === 'urbanization') && index.isUnder(n, scope),
  );
  const point = entryPoint(entry);
  const km = (n: TemplateNodeLite) => {
    const c = point ? index.coords(n) : null;
    return point && c ? distanceKm(point.lat, point.lng, c.lat, c.lng) : null;
  };

  const names = [entry.name, entry.subName].filter((s): s is string => !!s);
  const similar = pool
    .map((n) => ({
      n,
      s: Math.max(...names.flatMap((name) => [n.name, ...(n.aliases || [])].map((v) => nameSimilarity(name, v)))),
    }))
    .filter((x) => x.s >= 0.6)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((x) => x.n);
  const nearby = point
    ? pool
        .filter((n) => n.level !== 'municipality')
        .map((n) => ({ n, d: km(n) }))
        .filter((x): x is { n: TemplateNodeLite; d: number } => x.d != null && x.d <= 15)
        .sort((a, b) => a.d - b.d)
        .slice(0, 8)
        .map((x) => x.n)
    : [];
  const placeNodes = [...new Map([...similar, ...nearby].map((n) => [n.id, n])).values()];

  // Municipalities inside the place the feed reached (all of the province's
  // when it only reached the province), nearest first when there is a GPS.
  const muniScope = anchor.level === 'municipality' || anchor.level === 'town' ? index.ancestor(anchor, 'municipality') ?? anchor : anchor;
  let munis = pool.filter((n) => n.level === 'municipality' && (n.id === muniScope.id || index.isUnder(n, muniScope)));
  if (point) {
    munis = munis
      .map((n) => ({ n, d: km(n) }))
      .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9))
      .slice(0, 25)
      .map((x) => x.n);
  } else {
    munis = munis.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 120);
  }

  return {
    entry,
    anchor,
    places: placeNodes.map((node, i) => ({ label: `P${i + 1}`, node })),
    municipalities: munis.map((node, i) => ({ label: `M${i + 1}`, node })),
  };
}

export function buildPrompt(index: TemplateIndex, questions: ReviewQuestion[]): string {
  const pathOf = (n: TemplateNodeLite) => index.path(n).map((p) => p.name).join(' > ');
  const blocks = questions.map((q, i) => {
    const point = entryPoint(q.entry);
    const sub = q.entry.subName ? ` (sub-location "${q.entry.subName}")` : '';
    const gps = point ? ` — listings around ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}` : '';
    const places = q.places.length
      ? q.places.map((c) => `   ${c.label}: ${c.node.name} [${c.node.level}] — ${pathOf(c.node)}`).join('\n')
      : '   (none)';
    const munis = q.municipalities.map((c) => `${c.label} ${c.node.name}`).join('; ') || '(none)';
    return `${i + 1}. "${q.entry.name}"${sub}, sent under ${pathOf(q.anchor)}${gps}\n  Places:\n${places}\n  Municipalities: ${munis}`;
  });
  return `You sort Spanish real-estate location names from property feeds into an official place list.

For each numbered name decide ONE of:
- "same": it is another spelling or name of one of ITS listed Places (Valencian/Spanish forms, missing article, typos, capitals). Give that place's P-id.
- "new": it is a real town, village, district, beach or urbanization that is NOT among its Places. Give the M-id of the municipality it lies in.
- "dismiss": it is not a place name at all (e.g. "Rural location", "Inland", "Countryside", "Beachside").
If you are not confident, use null. Use only ids listed for that same name.

${blocks.join('\n\n')}

Reply ONLY with JSON: {"1": {"action": "same", "id": "P2", "reason": "<under 15 words>"}, "2": {"action": "new", "id": "M5", "reason": "..."}, "3": {"action": "dismiss", "reason": "..."}, "4": null, ...}`;
}

/** The model's answers, kept only where they point at something it was shown. */
export function readAnswers(
  index: TemplateIndex,
  questions: ReviewQuestion[],
  answer: Record<string, unknown>,
  now = new Date(),
): Map<number, AiProposal> {
  const out = new Map<number, AiProposal>();
  const at = now.toISOString();
  questions.forEach((q, i) => {
    const raw = answer[String(i + 1)] as { action?: unknown; id?: unknown; reason?: unknown } | null | undefined;
    const reason = raw && typeof raw.reason === 'string' ? raw.reason.slice(0, 200) : undefined;
    const action = raw && typeof raw.action === 'string' ? raw.action : null;
    if (action === 'dismiss') {
      out.set(q.entry.id, { action: 'dismiss', reason, at });
      return;
    }
    if (action === 'same' || action === 'new') {
      const list = action === 'same' ? q.places : q.municipalities;
      const hit = list.find((c) => c.label === String(raw?.id ?? '').trim().toUpperCase());
      if (hit) {
        const point = entryPoint(q.entry);
        const c = point ? index.coords(hit.node) : null;
        const km = point && c ? Math.round(distanceKm(point.lat, point.lng, c.lat, c.lng) * 10) / 10 : null;
        out.set(q.entry.id, {
          action,
          nodeId: hit.node.id,
          target: index.path(hit.node).map((p) => p.name).join(' › '),
          reason,
          km,
          flagged: km != null && km > MAX_PROPOSAL_KM,
          at,
        });
        return;
      }
    }
    out.set(q.entry.id, { action: null, reason, at });
  });
  return out;
}

/** Safe to apply without a person: an actual place, and the listings are near it. */
export function autoApplicable(p: AiProposal): boolean {
  if (p.action === 'new') return !p.flagged;
  if (p.action === 'same') return p.km != null && !p.flagged;
  return false;
}
