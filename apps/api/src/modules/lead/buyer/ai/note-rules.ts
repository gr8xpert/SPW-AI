import { createHash } from 'crypto';
import { RULE_NUMBER_FIELDS, type NoteRule, type NoteRuleBody, type RuleNumberField } from '@spm/shared';
import { stripAccents } from '../../../location-template/location-name';

// Rules read from a buyer's notes, and checking a listing against them.
// Pure. The AI only proposes rules; whether a listing breaks one is decided
// here, from the listing's own data.

export const MAX_RULES = 20;
const MAX_TEXT = 200;
const HARD_PENALTY = 40;
const SOFT_PENALTY = 15;

export interface RuleLists {
  featureIds: Set<number>;
  typeIds: Set<number>;
  locationIds: Set<number>;
  // A place name from the model → a location id (or null).
  resolvePlace: (name: string) => number | null;
}

const isId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function ruleKey(rule: NoteRuleBody): string {
  switch (rule.kind) {
    case 'floor':
      return `floor:${rule.mode}:${rule.value}`;
    case 'feature':
      return `feature:${rule.mode}:${rule.featureId}`;
    case 'type':
      return `type:avoid:${rule.propertyTypeId}`;
    case 'place':
      return `place:avoid:${rule.locationId}`;
    default:
      return `${rule.kind}:${rule.field}`;
  }
}

// The rule a key contradicts (avoid ↔ require on the same thing).
const opposite = (key: string): string | null => {
  const m = /^(floor|feature):(avoid|require):(.+)$/.exec(key);
  return m ? `${m[1]}:${m[2] === 'avoid' ? 'require' : 'avoid'}:${m[3]}` : null;
};

function body(r: Record<string, unknown>, lists: RuleLists): NoteRuleBody | null {
  const mode = r.mode === 'require' ? 'require' : r.mode === 'avoid' ? 'avoid' : null;
  switch (r.kind) {
    case 'floor':
      return mode && (r.value === 'ground' || r.value === 'top') ? { kind: 'floor', mode, value: r.value } : null;
    case 'feature': {
      const id = isId(r.featureId);
      return mode && id && lists.featureIds.has(id) ? { kind: 'feature', mode, featureId: id } : null;
    }
    case 'type': {
      const id = isId(r.propertyTypeId);
      return mode === 'avoid' && id && lists.typeIds.has(id) ? { kind: 'type', mode, propertyTypeId: id } : null;
    }
    case 'place': {
      if (mode !== 'avoid') return null;
      const saved = isId(r.locationId);
      const id = saved && lists.locationIds.has(saved) ? saved : typeof r.place === 'string' ? lists.resolvePlace(r.place) : null;
      return id ? { kind: 'place', mode, locationId: id } : null;
    }
    case 'max':
    case 'min': {
      if (!(RULE_NUMBER_FIELDS as readonly unknown[]).includes(r.field)) return null;
      const value = Number(typeof r.value === 'string' ? r.value.replace(/[^\d.]/g, '') : r.value);
      return Number.isFinite(value) && value > 0 && value < 1e10 ? { kind: r.kind, field: r.field as RuleNumberField, value } : null;
    }
    default:
      return null;
  }
}

// Rules from the model (place by name) or from the dashboard (place by id),
// checked against the agency's lists. One rule per key; the first of two
// contradicting rules wins.
export function cleanRules(raw: unknown, lists: RuleLists, max = MAX_RULES): NoteRule[] {
  if (!Array.isArray(raw)) return [];
  const out: NoteRule[] = [];
  const keys = new Set<string>();
  for (const item of raw) {
    if (out.length >= max) break;
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const text = typeof r.text === 'string' ? r.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : '';
    if (!text) continue;
    const b = body(r, lists);
    if (!b) continue;
    const id = ruleKey(b);
    const contra = opposite(id);
    if (keys.has(id) || (contra && keys.has(contra))) continue;
    keys.add(id);
    out.push({ id, ...b, text, strength: r.strength === 'soft' ? 'soft' : 'hard' } as NoteRule);
  }
  return out;
}

export interface FloorFacts {
  ground: boolean | null;
  top: boolean | null;
}

const norm = (s: string): string => stripAccents(s.toLowerCase()).replace(/\s+/g, ' ').trim();
const GROUND = /\b(ground|planta baja|bajo|baja|begane grond|rez de chaussee|rdc|erdgeschoss|parterre|gelijkvloers)\b/;
const TOP = /\b(penthouse|atico|top floor|ultima planta|last floor|dachgeschoss|dakappartement)\b/;
const MIDDLE = /\b(middle floor|planta intermedia|tussenverdieping|mid floor)\b/;
const HOUSE = /\b(villa|house|townhouse|town house|detached|semi detached|bungalow|finca|chalet|cortijo|country house|plot)\b/;

function fromFloorText(raw: string | null | undefined): FloorFacts | null {
  const s = norm(String(raw ?? ''));
  if (!s) return null;
  if (TOP.test(s) || s === 'top') return { ground: false, top: true };
  if (/^(0|00|pb|gf|bg|eg)$/.test(s) || GROUND.test(s)) return { ground: true, top: null };
  const n = /^-?(\d{1,2})(st|nd|rd|th|º|o|e)?( floor| planta| piso)?$/.exec(s);
  if (n) return Number(n[1]) === 0 ? { ground: true, top: null } : { ground: false, top: null };
  return null;
}

function fromNames(namesList: string[]): FloorFacts | null {
  for (const name of namesList) {
    const s = norm(name);
    if (TOP.test(s)) return { ground: false, top: true };
    if (/\bground floor\b|planta baja|\bbajo\b|begane grond|rez de chaussee|erdgeschoss/.test(s)) return { ground: true, top: false };
    if (MIDDLE.test(s)) return { ground: false, top: false };
  }
  for (const name of namesList) {
    // A house is not a ground-floor flat; whether it is "top" is unknown.
    if (HOUSE.test(norm(name))) return { ground: false, top: null };
  }
  return null;
}

// Which floor a listing is on, from the floor text, else the property type
// name ("Ground Floor Apartment", "Penthouse"), else its features. Feeds
// rarely fill the floor, so the names matter.
export function floorFacts(floor: string | null | undefined, typeNames: string[], featureNames: string[]): FloorFacts {
  // Each fact from the first source that knows it.
  const sources = [fromFloorText(floor), fromNames(typeNames), fromNames(featureNames)];
  return {
    ground: sources.find((x) => x?.ground != null)?.ground ?? null,
    top: sources.find((x) => x?.top != null)?.top ?? null,
  };
}

export interface RuleFacts {
  floor: FloorFacts;
  features: number[] | null;
  propertyTypeId: number | null;
  locationId: number | null;
  // A single value is { low: v, high: v }; a development's range is its ends.
  numbers: Partial<Record<RuleNumberField, { low: number; high: number } | null>>;
  // A rule's place / type and everything below it (else equality).
  within: { places: Map<number, Set<number>>; types: Map<number, Set<number>> };
}

type Verdict = 'ok' | 'broken' | 'unknown';

function verdict(rule: NoteRule, f: RuleFacts): Verdict {
  const yes = (b: boolean): Verdict => (b ? 'broken' : 'ok');
  switch (rule.kind) {
    case 'floor': {
      const v = rule.value === 'ground' ? f.floor.ground : f.floor.top;
      if (v === null) return 'unknown';
      return yes(rule.mode === 'avoid' ? v : !v);
    }
    case 'feature': {
      if (!Array.isArray(f.features)) return 'unknown';
      const has = f.features.map(Number).includes(rule.featureId);
      return yes(rule.mode === 'avoid' ? has : !has);
    }
    case 'type': {
      if (f.propertyTypeId == null) return 'unknown';
      const set = f.within.types.get(rule.propertyTypeId);
      return yes(set ? set.has(f.propertyTypeId) : f.propertyTypeId === rule.propertyTypeId);
    }
    case 'place': {
      if (f.locationId == null) return 'unknown';
      const set = f.within.places.get(rule.locationId);
      return yes(set ? set.has(f.locationId) : f.locationId === rule.locationId);
    }
    default: {
      const n = f.numbers[rule.field];
      if (!n) return 'unknown';
      // Some unit of a range that fits is enough.
      return yes(rule.kind === 'max' ? n.low > rule.value : n.high < rule.value);
    }
  }
}

export function checkRules(rules: NoteRule[], facts: RuleFacts): { broken: NoteRule[]; unknown: NoteRule[] } {
  const broken: NoteRule[] = [];
  const unknown: NoteRule[] = [];
  for (const rule of rules) {
    const v = verdict(rule, facts);
    if (v === 'broken') broken.push(rule);
    else if (v === 'unknown') unknown.push(rule);
  }
  return { broken, unknown };
}

export function rulePenalty(score: number, broken: NoteRule[]): number {
  const minus = broken.reduce((sum, r) => sum + (r.strength === 'soft' ? SOFT_PENALTY : HARD_PENALTY), 0);
  return Math.max(0, score - minus);
}

// Which notes the rules were read from, to tell when they changed.
export function rulesHash(notes: string | null | undefined): string {
  const s = String(notes ?? '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(s).digest('hex');
}
