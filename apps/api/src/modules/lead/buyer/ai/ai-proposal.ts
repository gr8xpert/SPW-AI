import type { BuyerWishlist, NoteRule } from '@spm/shared';
import { MATCH_LISTING_TYPES } from '../buyer-match';
import { clip } from './ai-json';
import { resolvePlaces, type NamedPlace, type ResolvedPlace } from './place-names';
import { cleanRules } from './note-rules';

// A model's wishlist suggestion (from a pasted message, a voice note or the
// buyer's comments), checked field by field against the real wishlist
// fields and the agency's lists. Pure. Nothing here is saved: the agent ticks
// the changes to keep.

export interface ProposalLists {
  featureIds: Set<number>;
  typeIds: Set<number>;
  places: NamedPlace[];
}

export interface Proposal {
  wishlist: BuyerWishlist;
  places: ResolvedPlace[];
  rules: NoteRule[];
  note?: string;
  transcript?: string;
}

export interface WishlistChange {
  field: keyof BuyerWishlist;
  from: unknown;
  to: unknown;
}

const LIST_FIELDS = ['listingTypes', 'locationIds', 'propertyTypeIds', 'featureIds'] as const;
const NUMBER_LIMITS = {
  minBedrooms: 20,
  minBathrooms: 20,
  budgetMin: 1e10,
  budgetMax: 1e10,
  minBuildSize: 1e6,
  maxBuildSize: 1e6,
  minPlotSize: 1e7,
  maxPlotSize: 1e7,
} as const;
type NumberField = keyof typeof NUMBER_LIMITS;
const NUMBER_FIELDS = Object.keys(NUMBER_LIMITS) as NumberField[];
// The order changes are shown in.
const FIELD_ORDER: (keyof BuyerWishlist)[] = [
  'listingTypes', 'locationIds', 'propertyTypeIds', 'featureIds', 'minBedrooms', 'minBathrooms',
  'budgetMin', 'budgetMax', 'currency', 'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize',
];

// "400k", "1.5m", "450.000", "€ 1,200,000", 350000 → a number.
export function amount(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase().replace(/\s/g, '');
  const m = /^[^\d]*([\d.,]+)(k|m|mil|million|mln)?[^\d]*$/.exec(s);
  if (!m) return undefined;
  let digits = m[1];
  if (m[2]) digits = digits.replace(',', '.');
  else digits = digits.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(digits) * (m[2] === 'k' ? 1e3 : m[2] ? 1e6 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function ids(v: unknown, known: Set<number>): number[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && known.has(n)))];
}

export function cleanProposal(raw: Record<string, unknown> | null, lists: ProposalLists): Proposal {
  const r = raw && typeof raw === 'object' ? raw : {};
  const w = (r.wishlist && typeof r.wishlist === 'object' ? r.wishlist : {}) as Record<string, unknown>;
  const wishlist: BuyerWishlist = {};

  if (Array.isArray(w.listingTypes)) {
    const types = [...new Set(w.listingTypes.filter((t) => (MATCH_LISTING_TYPES as readonly unknown[]).includes(t)))];
    if (types.length) wishlist.listingTypes = types as BuyerWishlist['listingTypes'];
  }
  const places = resolvePlaces(w.places, lists.places);
  const locationIds = [...new Set(places.map((p) => p.id).filter((id): id is number => id !== null))];
  if (locationIds.length) wishlist.locationIds = locationIds;
  const typeIds = ids(w.propertyTypeIds, lists.typeIds);
  if (typeIds.length) wishlist.propertyTypeIds = typeIds;
  const featureIds = ids(w.featureIds, lists.featureIds);
  if (featureIds.length) wishlist.featureIds = featureIds;

  for (const f of NUMBER_FIELDS) {
    const n = amount(w[f]);
    if (n !== undefined && n <= NUMBER_LIMITS[f]) wishlist[f] = n;
  }
  for (const [lo, hi] of [['budgetMin', 'budgetMax'], ['minBuildSize', 'maxBuildSize'], ['minPlotSize', 'maxPlotSize']] as const) {
    const a = wishlist[lo];
    const b = wishlist[hi];
    if (a && b && a > b) [wishlist[lo], wishlist[hi]] = [b, a];
  }
  if (typeof w.currency === 'string' && /^[a-z]{3}$/i.test(w.currency.trim())) wishlist.currency = w.currency.trim().toUpperCase();

  const known = new Map(places.filter((p) => p.id !== null).map((p) => [p.name.toLowerCase(), p.id as number]));
  const rules = cleanRules(r.rules, {
    featureIds: lists.featureIds,
    typeIds: lists.typeIds,
    locationIds: new Set(lists.places.map((p) => p.id)),
    resolvePlace: (name) => known.get(name.toLowerCase()) ?? resolvePlaces([name], lists.places)[0]?.id ?? null,
  });

  const out: Proposal = { wishlist, places, rules };
  const note = typeof r.note === 'string' ? clip(r.note, 2000) : '';
  if (note) out.note = note;
  const transcript = typeof r.transcript === 'string' ? clip(r.transcript, 3000) : '';
  if (transcript) out.transcript = transcript;
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// What accepting the proposal would change in the saved wishlist. Lists are
// added to (a wishlist guessed from an enquiry is replaced instead), numbers
// and the currency replace.
export function proposalChanges(current: BuyerWishlist | null, proposal: BuyerWishlist): WishlistChange[] {
  const cur = current ?? {};
  const changes: WishlistChange[] = [];
  for (const field of FIELD_ORDER) {
    const next = proposal[field];
    if (next === undefined) continue;
    const from = cur[field] ?? null;
    let to: unknown = next;
    if ((LIST_FIELDS as readonly string[]).includes(field) && Array.isArray(from) && !cur.guessed) {
      to = [...new Set([...(from as unknown[]), ...(next as unknown[])])];
    }
    if (!same(from, to)) changes.push({ field, from, to });
  }
  return changes;
}
