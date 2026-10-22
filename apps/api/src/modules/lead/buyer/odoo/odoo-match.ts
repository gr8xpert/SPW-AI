import { BUYER_ID_TYPES, BUYER_ROLES, BUYER_SUB_STATUSES } from '@spm/shared';
import type { BuyerRole, BuyerWishlist, PreferredContact } from '@spm/shared';
import { locationKey } from '../../../location-template/location-name';
import { FEATURE_FIELDS, ODOO_COLUMNS, QUESTION_FIELDS, type OdooField } from './odoo-columns';
import type { OdooBuyer } from './odoo-parse';

// Odoo names → SPM ids and values. Pure: the service loads the lists.
//
// Every name is compared as a locationKey (lower case, no accents, only
// letters and digits), so "Nueva Andalucía" finds "Nueva Andalucia". What
// can't be matched is collected (kind + value) for the preview's mapping
// dropdowns; on import an unmapped value goes into the buyer's notes.

type Names = Record<string, string> | null | undefined;

export interface MatchLists {
  agents: { id: number; name: string | null; email: string }[];
  locations: { id: number; name: Names; aliases?: string[] | null; level: string }[];
  types: { id: number; name: Names }[];
  features: { id: number; name: Names }[];
  stages: { id: number; name: Names; kind: string; sortOrder: number }[];
  questions: { qkey: string; options: { key: string; label: Names }[] }[];
}

// What a value can be mapped to: an id, or a fixed key (role, listing type,
// question option). "skip" = leave it unmatched on purpose.
export type MatchKind = 'agent' | 'town' | 'type' | 'feature' | 'stage' | 'role' | 'listingType' | `option:${string}`;
export type ImportMapping = Partial<Record<string, Record<string, string | number>>>;

export interface UnmatchedValue {
  kind: MatchKind;
  key: string; // locationKey of the value: the mapping key
  value: string; // as written in Odoo
  column: string; // the Odoo header, for notes
}

export interface SuggestionRef {
  reference: string | null;
  agentReference: string | null;
  status: SuggestionStatusValue;
  visitDate: string | null;
  note: string | null;
}
type SuggestionStatusValue = 'suggested' | 'sent' | 'visited' | 'interested' | 'not_interested';

export interface MappedBuyer {
  odooId: string;
  row: number;
  email: string | null;
  name: string;
  fields: Record<string, unknown>; // lead columns
  wishlist: BuyerWishlist | null;
  answers: Record<string, string[]>;
  agentId: number | null;
  relatedAgentIds: number[];
  stageId: number | null;
  createdAt: Date | null;
  odooNotes: string | null;
  suggestions: SuggestionRef[];
  unmatched: UnmatchedValue[];
  // "Towns: Benahavís Hills" — what goes into the notes.
  notMatched: string[];
}

export const key = (v: unknown): string => locationKey(String(v ?? ''));

const ROLE_MAP: Record<string, BuyerRole> = {
  ...Object.fromEntries(BUYER_ROLES.map((r) => [key(r.replace('_', ' ')), r])),
  'real estate agent': 'estate_agent',
  agent: 'estate_agent',
  'registered user': 'registered',
  owner: 'seller',
};
const PRIORITY_MAP: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, normal: 0, none: 0, low: 1, medium: 2, high: 2, 'very high': 3, urgent: 3,
};
const SUB_STATUS_MAP: Record<string, string> = Object.fromEntries(BUYER_SUB_STATUSES.map((s) => [key(s.replace('_', ' ')), s]));
const ID_TYPE_MAP: Record<string, string> = { ...Object.fromEntries(BUYER_ID_TYPES.map((s) => [s, s])), pasaporte: 'passport' };
const CONTACT_MAP: Record<string, PreferredContact> = {
  call: 'call', phone: 'call', 'phone call': 'call', telephone: 'call', email: 'email', 'e mail': 'email', mail: 'email', whatsapp: 'whatsapp', 'whats app': 'whatsapp',
};
const SEND_MAP: Record<string, 'buyer' | 'agent' | 'both'> = { buyer: 'buyer', agent: 'agent', both: 'both', 'buyer and agent': 'both' };
const LISTING_MAP: Record<string, NonNullable<BuyerWishlist['listingTypes']>[number]> = {
  sale: 'sale', sales: 'sale', resale: 'sale', 'for sale': 'sale', buy: 'sale',
  development: 'development', 'new development': 'development', 'new build': 'development', 'off plan': 'development', 'new developments': 'development',
  rent: 'rent', rental: 'rent', 'long term rent': 'rent', 'long term rental': 'rent', 'for rent': 'rent', 'long term': 'rent',
  'holiday rent': 'holiday_rent', 'holiday rental': 'holiday_rent', 'short term rent': 'holiday_rent', 'short term rental': 'holiday_rent', 'vacation rental': 'holiday_rent',
};
// Odoo status → the default SPM stage names (English), when the client's
// stages don't carry the Odoo name itself.
const STATUS_ALIASES: Record<string, string> = {
  new: 'new lead', 'new lead': 'new lead', lead: 'new lead', contacted: 'contacted', 'in contact': 'contacted',
  qualified: 'requirements mapped', 'requirements mapped': 'requirements mapped', 'selection sent': 'selection sent',
  viewing: 'viewing', 'viewing scheduled': 'viewing', visit: 'viewing', offer: 'offer reservation', reservation: 'offer reservation',
  negotiating: 'offer reservation', notary: 'notary', won: 'won', sold: 'won', bought: 'won', lost: 'lost', 'not interested': 'lost',
};
const SUGGESTION_MAP: Record<string, SuggestionStatusValue> = {
  suggested: 'suggested', new: 'suggested', draft: 'suggested', sent: 'sent', send: 'sent', visited: 'visited', viewed: 'visited',
  interested: 'interested', 'not interested': 'not_interested', rejected: 'not_interested', declined: 'not_interested',
};
const LANGUAGE_NAMES: Record<string, string> = {
  english: 'en', dutch: 'nl', nederlands: 'nl', spanish: 'es', espanol: 'es', german: 'de', deutsch: 'de', french: 'fr', francais: 'fr',
  italian: 'it', italiano: 'it', portuguese: 'pt', portugues: 'pt', swedish: 'sv', svenska: 'sv', norwegian: 'no', norsk: 'no',
  danish: 'da', dansk: 'da', finnish: 'fi', suomi: 'fi', russian: 'ru', polish: 'pl', polski: 'pl', belgian: 'nl', flemish: 'nl',
};

let countryNames: Map<string, string> | null = null;
function countryCode(v: string): string | null {
  const t = v.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  if (!countryNames) {
    countryNames = new Map();
    try {
      const names = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          const name = names.of(code);
          if (name && name !== code) countryNames.set(key(name), code);
        }
      }
    } catch {
      /* no Intl data: codes only */
    }
    countryNames.set('the netherlands', 'NL');
    countryNames.set('holland', 'NL');
    countryNames.set('england', 'GB');
    countryNames.set('uk', 'GB');
    countryNames.set('usa', 'US');
  }
  return countryNames.get(key(t)) ?? null;
}

function languageCode(v: string): string | null {
  const t = v.trim();
  const m = /^([a-z]{2})([_-][A-Za-z]{2})?$/.exec(t);
  if (m) return m[1];
  for (const part of t.split(/[/(),]+/)) {
    const code = LANGUAGE_NAMES[key(part).split(' ')[0]];
    if (code) return code;
  }
  return null;
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function date(v: string | undefined): string | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function allNames(n: Names): string[] {
  return n ? Object.values(n).filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
}

function index<T extends { id: number }>(items: T[], names: (t: T) => string[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    for (const n of new Set(names(item).map(key).filter(Boolean))) {
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push(item);
    }
  }
  return map;
}

// What the preview offers in each mapping dropdown.
export interface Choice {
  value: string | number;
  label: string;
}

export class OdooMatchers {
  private towns: Map<string, MatchLists['locations']>;
  private types: Map<string, MatchLists['types']>;
  private features: Map<string, MatchLists['features']>;
  private stages: Map<string, MatchLists['stages']>;
  private agentsByEmail: Map<string, number>;
  private agentsByName: Map<string, number>;
  private options: Map<string, Map<string, string>>;

  constructor(private readonly lists: MatchLists) {
    this.towns = index(lists.locations, (l) => [...allNames(l.name), ...(l.aliases ?? [])]);
    this.types = index(lists.types, (t) => allNames(t.name));
    this.features = index(lists.features, (f) => allNames(f.name));
    this.stages = index(lists.stages, (s) => allNames(s.name));
    this.agentsByEmail = new Map(lists.agents.map((a) => [a.email.toLowerCase(), a.id]));
    this.agentsByName = new Map(lists.agents.filter((a) => a.name).map((a) => [key(a.name), a.id]));
    this.options = new Map(
      lists.questions.map((q) => [q.qkey, new Map(q.options.flatMap((o) => allNames(o.label).map((l) => [key(l), o.key] as [string, string])))]),
    );
  }

  match(kind: MatchKind, value: string): string | number | null {
    const k = key(value);
    if (!k) return null;
    switch (kind) {
      case 'agent':
        return this.agentsByEmail.get(value.trim().toLowerCase()) ?? this.agentsByName.get(k) ?? null;
      case 'town': {
        const found = this.towns.get(k);
        if (!found?.length) return null;
        // A name that is a town and also an area: the town (what Odoo means).
        return (found.find((l) => l.level === 'town') ?? found[0]).id;
      }
      case 'type':
        return this.types.get(k)?.[0]?.id ?? null;
      case 'feature':
        return this.features.get(k)?.[0]?.id ?? null;
      case 'stage': {
        const direct = this.stages.get(k)?.[0];
        if (direct) return direct.id;
        const alias = STATUS_ALIASES[k];
        if (!alias) return null;
        const byName = this.stages.get(alias)?.[0];
        if (byName) return byName.id;
        const kind2 = alias === 'won' ? 'won' : alias === 'lost' ? 'lost' : null;
        return kind2 ? this.lists.stages.find((s) => s.kind === kind2)?.id ?? null : null;
      }
      case 'role':
        return ROLE_MAP[k] ?? null;
      case 'listingType':
        return LISTING_MAP[k] ?? null;
      default: {
        const qkey = kind.slice('option:'.length);
        return this.options.get(qkey)?.get(k) ?? null;
      }
    }
  }

  // Whether an id / key chosen in the mapping really exists.
  valid(kind: MatchKind, target: string | number): boolean {
    return this.choices(kind).some((c) => String(c.value) === String(target));
  }

  choices(kind: MatchKind): Choice[] {
    const en = (n: Names) => (n && (n.en || Object.values(n)[0])) || '';
    switch (kind) {
      case 'agent':
        return this.lists.agents.map((a) => ({ value: a.id, label: a.name || a.email }));
      case 'town':
        return this.lists.locations.map((l) => ({ value: l.id, label: `${en(l.name)} (${l.level})` }));
      case 'type':
        return this.lists.types.map((t) => ({ value: t.id, label: en(t.name) }));
      case 'feature':
        return this.lists.features.map((f) => ({ value: f.id, label: en(f.name) }));
      case 'stage':
        return [...this.lists.stages].sort((a, b) => a.sortOrder - b.sortOrder).map((s) => ({ value: s.id, label: en(s.name) }));
      case 'role':
        return BUYER_ROLES.map((r) => ({ value: r, label: r.replace('_', ' ') }));
      case 'listingType':
        return ['sale', 'development', 'rent', 'holiday_rent'].map((l) => ({ value: l, label: l.replace('_', ' ') }));
      default: {
        const q = this.lists.questions.find((x) => x.qkey === kind.slice('option:'.length));
        return (q?.options ?? []).map((o) => ({ value: o.key, label: en(o.label) }));
      }
    }
  }
}

// Kinds whose mapping targets are numeric ids (the rest are keys).
const ID_KINDS = new Set<MatchKind>(['agent', 'town', 'type', 'feature', 'stage']);

// "towns" → "Towns", "property type" → "Property Type", for the notes.
const COLUMN_LABEL = (f: OdooField): string =>
  ODOO_COLUMNS[f][0].replace(/(^|\s)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());

export function mapOdooBuyer(b: OdooBuyer, m: OdooMatchers, mapping: ImportMapping = {}): MappedBuyer {
  const unmatched: UnmatchedValue[] = [];
  const notMatched: string[] = [];
  const v = b.values;

  // A value through the mapping (when set) or the matcher; null = unmatched.
  const resolve = (kind: MatchKind, value: string, column: OdooField): string | number | null => {
    const k = key(value);
    const chosen = mapping[kind]?.[k];
    if (chosen !== undefined && chosen !== 'skip' && chosen !== '' && m.valid(kind, chosen)) {
      return ID_KINDS.has(kind) ? Number(chosen) : String(chosen);
    }
    const found = chosen === 'skip' ? null : m.match(kind, value);
    if (found === null) {
      if (!unmatched.some((u) => u.kind === kind && u.key === k)) unmatched.push({ kind, key: k, value, column: COLUMN_LABEL(column) });
      notMatched.push(`${COLUMN_LABEL(column)}: ${value}`);
    }
    return found;
  };
  const many = (kind: MatchKind, field: OdooField): (string | number)[] => {
    const out: (string | number)[] = [];
    for (const value of b.multi[field] ?? []) {
      const r = resolve(kind, value, field);
      if (r !== null && !out.includes(r)) out.push(r);
    }
    return out;
  };
  // A fixed list (sub-status, ID type…): unknown values only go to the notes.
  const fixed = <T>(map: Record<string, T>, field: OdooField): T | undefined => {
    const value = v[field];
    if (!value) return undefined;
    const hit = map[key(value)];
    if (hit === undefined) notMatched.push(`${COLUMN_LABEL(field)}: ${value}`);
    return hit;
  };

  const fields: Record<string, unknown> = {};
  const copy: [OdooField, string, number][] = [
    ['firstName', 'firstName', 100], ['lastName', 'lastName', 100], ['phone', 'phone', 50], ['mobile', 'mobile', 50],
    ['street', 'street', 255], ['street2', 'street2', 255], ['city', 'city', 100], ['zip', 'zip', 20], ['state', 'state', 100],
    ['lawyer', 'lawyer', 255], ['referredBy', 'referredBy', 150], ['idNumber', 'idNumber', 50],
  ];
  for (const [from, to, max] of copy) if (v[from]) fields[to] = v[from]!.slice(0, max);
  if (!v.firstName && !v.lastName && v.name) {
    const [first, ...rest] = v.name.split(/\s+/);
    fields.firstName = first.slice(0, 100);
    if (rest.length) fields.lastName = rest.join(' ').slice(0, 100);
  }
  if (v.language) {
    const code = languageCode(v.language);
    if (code) fields.language = code;
    else notMatched.push(`Language: ${v.language}`);
  }
  if (v.country) {
    const code = countryCode(v.country);
    if (code) fields.country = code;
    else notMatched.push(`Country: ${v.country}`);
  }
  const role = v.role ? resolve('role', v.role, 'role') : null;
  if (role) fields.role = role;
  const priority = fixed(PRIORITY_MAP, 'priority');
  if (priority !== undefined) fields.priority = priority;
  const sub = fixed(SUB_STATUS_MAP, 'subStatus');
  if (sub) fields.subStatus = sub;
  const idType = fixed(ID_TYPE_MAP, 'idType');
  if (idType) fields.idType = idType;
  const contact = fixed(CONTACT_MAP, 'preferredContact');
  if (contact) fields.preferredContact = contact;
  const referral = num(v.referralPercent);
  if (referral !== undefined && referral <= 100) fields.referralPercent = referral;
  for (const [from, to] of [['waitingReplyAt', 'waitingReplyAt'], ['visitStart', 'visitStart'], ['visitEnd', 'visitEnd']] as [OdooField, string][]) {
    const d = date(v[from]);
    if (d) fields[to] = d;
  }

  // Agents
  const mainName = v.salesAgent || v.salesperson;
  const agentId = mainName ? (resolve('agent', mainName, v.salesAgent ? 'salesAgent' : 'salesperson') as number | null) : null;
  const relatedAgentIds = (many('agent', 'relatedAgents') as number[]).filter((id) => id !== agentId);

  const stageId = v.status ? (resolve('stage', v.status, 'status') as number | null) : null;

  // Wishlist
  const w: BuyerWishlist = {};
  const listingTypes = many('listingType', 'listingType') as NonNullable<BuyerWishlist['listingTypes']>;
  if (listingTypes.length) w.listingTypes = listingTypes;
  const towns = many('town', 'towns') as number[];
  if (towns.length) w.locationIds = towns;
  const types = many('type', 'propertyType') as number[];
  if (types.length) w.propertyTypeIds = types;
  const features = FEATURE_FIELDS.flatMap((f) => many('feature', f) as number[]);
  if (features.length) w.featureIds = [...new Set(features)];
  const numbers: [OdooField, keyof BuyerWishlist][] = [
    ['bedrooms', 'minBedrooms'], ['bathrooms', 'minBathrooms'], ['budgetMin', 'budgetMin'], ['budgetMax', 'budgetMax'],
    ['buildSize', 'minBuildSize'], ['plotSize', 'minPlotSize'],
  ];
  for (const [from, to] of numbers) {
    const n = num(v[from]);
    if (n !== undefined) (w as Record<string, unknown>)[to] = to === 'minBedrooms' || to === 'minBathrooms' ? Math.round(n) : n;
  }
  if (w.budgetMin && w.budgetMax && w.budgetMin > w.budgetMax) [w.budgetMin, w.budgetMax] = [w.budgetMax, w.budgetMin];
  const send = fixed(SEND_MAP, 'sendMatchesTo');
  if (send) w.sendMatchesTo = send;
  const wishlist = Object.keys(w).length ? { ...w, guessed: false } : null;

  // Buyer questions
  const answers: Record<string, string[]> = {};
  for (const [field, qkey] of Object.entries(QUESTION_FIELDS) as [OdooField, string][]) {
    const picked = many(`option:${qkey}`, field) as string[];
    if (picked.length) answers[qkey] = picked;
  }

  const suggestions: SuggestionRef[] = b.suggestions.map((s) => ({
    reference: s.reference,
    agentReference: s.agentReference,
    status: (s.status && SUGGESTION_MAP[key(s.status)]) || 'suggested',
    visitDate: date(s.visitDate ?? undefined),
    note: s.note ? s.note.slice(0, 2000) : null,
  }));

  const email = v.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim()) ? v.email.trim().toLowerCase() : null;
  if (v.email && !email) notMatched.push(`Email: ${v.email}`);
  const created = date(v.createdOn);
  const name = [fields.firstName, fields.lastName].filter(Boolean).join(' ') || v.name || email || b.id;

  return {
    odooId: b.id.slice(0, 50),
    row: b.row,
    email,
    name: String(name),
    fields,
    wishlist,
    answers,
    agentId,
    relatedAgentIds,
    stageId,
    createdAt: created ? new Date(`${created}T12:00:00Z`) : null,
    odooNotes: v.notes ?? null,
    suggestions,
    unmatched,
    notMatched: [...new Set(notMatched)],
  };
}

export const NOT_MATCHED_HEADING = 'Not matched in SPM (Odoo import):';

export const ODOO_NOTES_START = '[From Odoo]';
export const ODOO_NOTES_END = '[/From Odoo]';

// The buyer's notes after an import. Odoo's notes and what SPM couldn't
// place sit between two marker lines; a re-import replaces only that part,
// so whatever the agent wrote in SPM (above or below it) is kept.
export function importNotes(current: string | null, mapped: Pick<MappedBuyer, 'odooNotes' | 'notMatched'>): string | null {
  const inner = [mapped.odooNotes?.trim(), mapped.notMatched.length ? [NOT_MATCHED_HEADING, ...mapped.notMatched.map((n) => `- ${n}`)].join('\n') : '']
    .filter(Boolean)
    .join('\n\n');
  const block = inner ? `${ODOO_NOTES_START}\n${inner}\n${ODOO_NOTES_END}` : '';
  const text = current ?? '';
  const start = text.indexOf(ODOO_NOTES_START);
  const end = start >= 0 ? text.indexOf(ODOO_NOTES_END, start) : -1;
  const before = (start >= 0 ? text.slice(0, start) : text).trim();
  const after = end >= 0 ? text.slice(end + ODOO_NOTES_END.length).trim() : '';
  return [before, block, after].filter(Boolean).join('\n\n') || null;
}
