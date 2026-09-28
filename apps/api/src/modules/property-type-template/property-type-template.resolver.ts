import { locationKey } from '../location-template/location-name';

// Pure matching logic for property types, testable without a database.

export interface TypeNodeLite {
  id: number;
  parentId: number | null;
  name: string;
  nameKey: string;
  codes: string[] | null;
  aliases: string[] | null;
  status: 'ok' | 'needs_review' | 'ai_suggested';
}

// What a feed says about a listing's type. Resales sends codes (SubtypeId1
// "1-4", TypeId "1-1"); Kyero and Inmoba send names only.
export interface FeedTypeInput {
  name?: string | null;
  code?: string | null;
  parentName?: string | null;
  parentCode?: string | null;
}

export interface TypeResolution {
  // Template node the listing's type is (a type, or a group when only the
  // group is known).
  node: TypeNodeLite;
  // A type name the template doesn't know, to sit under `node` (a group).
  extraName: string | null;
  unmatched: boolean;
}

// Words feeds put in the type field that are not a property type. Resales
// sends "New Development" as the type name of development listings; their real
// unit type is in Subtype1.
const NOT_A_TYPE = new Set(['new development', 'new developments', 'development', 'unknown', 'other', '']);

export function isRealTypeName(name: string | null | undefined): boolean {
  return !NOT_A_TYPE.has(locationKey(name));
}

export class TypeTemplateIndex {
  readonly byId = new Map<number, TypeNodeLite>();
  private readonly byCode = new Map<string, TypeNodeLite[]>();
  private readonly byKey = new Map<string, TypeNodeLite[]>();

  constructor(nodes: TypeNodeLite[]) {
    for (const n of nodes) {
      this.byId.set(n.id, n);
      for (const c of n.codes || []) push(this.byCode, c.trim(), n);
      const keys = new Set([n.nameKey || locationKey(n.name), ...(n.aliases || []).map(locationKey)]);
      for (const k of keys) if (k) push(this.byKey, k, n);
    }
  }

  get size(): number {
    return this.byId.size;
  }

  findByCode(code: string | null | undefined): TypeNodeLite[] {
    return code ? this.byCode.get(code.trim()) || [] : [];
  }

  findByName(name: string | null | undefined): TypeNodeLite[] {
    return this.byKey.get(locationKey(name)) || [];
  }

  // Group first, the node itself last.
  path(node: TypeNodeLite): TypeNodeLite[] {
    const out: TypeNodeLite[] = [];
    let cur: TypeNodeLite | undefined = node;
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.unshift(cur);
      cur = cur.parentId != null ? this.byId.get(cur.parentId) : undefined;
    }
    return out;
  }

  isGroup(node: TypeNodeLite): boolean {
    return node.parentId == null;
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const statusRank = (s: TypeNodeLite['status']) => (s === 'ok' ? 0 : s === 'ai_suggested' ? 1 : 2);
const best = (nodes: TypeNodeLite[]) =>
  [...nodes].sort((a, b) => Number(a.parentId == null) - Number(b.parentId == null) || statusRank(a.status) - statusRank(b.status) || a.id - b.id)[0];

// Code first (exact, and it survives renames like "Finca - Cortijo"), then the
// name or an alias, preferring types inside the feed's group. With only the
// group known, the listing sits under the group and its name is kept as an
// unmatched type. Null when neither type nor group is known.
export function resolveType(index: TypeTemplateIndex, input: FeedTypeInput): TypeResolution | null {
  const name = isRealTypeName(input.name) ? (input.name || '').trim() : '';
  const group =
    best(index.findByCode(input.parentCode).filter((n) => index.isGroup(n))) ||
    (isRealTypeName(input.parentName) ? best(index.findByName(input.parentName).filter((n) => index.isGroup(n))) : undefined);

  const byCode = index.findByCode(input.code);
  if (byCode.length) return { node: best(byCode), extraName: null, unmatched: false };

  if (name) {
    let byName = index.findByName(name);
    if (group) {
      const inGroup = byName.filter((n) => n.id === group.id || n.parentId === group.id);
      if (inGroup.length) byName = inGroup;
    }
    if (byName.length) return { node: best(byName), extraName: null, unmatched: false };
  }

  if (group) {
    return name && locationKey(name) !== group.nameKey
      ? { node: group, extraName: name, unmatched: true }
      : { node: group, extraName: null, unmatched: false };
  }
  return null;
}
