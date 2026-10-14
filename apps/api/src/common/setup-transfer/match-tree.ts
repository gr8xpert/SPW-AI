// Copying a client's Locations / Property Types arrangement to another client.
//
// The file never carries places to create: it describes how client 1 arranged
// the rows it has, and the import finds client 2's own copy of each row and
// arranges that. Rows only one of the two clients has are left alone.
//
// A row is the same place in both accounts when it stands for the same
// platform template node, or — for rows outside the template — has the same
// name under the same (already matched) parent. The file also lists where the
// feed originally put each row and what it called it, so a place client 1
// renamed or moved is still found in client 2 at its feed spot.

/** One row of the exported account. */
export interface TransferFileNode {
  ref: number;
  parentRef: number | null;
  level?: string;
  /** Template nodes this row stands for (its own link + any merged into it). */
  templateIds: number[];
  /** Name keys with the parent they sit (or sat) under: current spot + feed origins. */
  places: Array<{ parentRef: number | null; key: string }>;
}

/** One row of the importing account. */
export interface TransferAccountNode {
  id: number;
  parentId: number | null;
  level?: string;
  templateIds: number[];
  /** Name keys: current English name + feed names it was renamed from. */
  keys: string[];
}

export interface TreeMatch {
  /** account row id → file ref */
  refFor: Map<number, number>;
  /** account rows with more than one equally good file row */
  ambiguous: number;
}

export function matchTree(file: TransferFileNode[], account: TransferAccountNode[]): TreeMatch {
  const byRef = new Map(file.map((n) => [n.ref, n]));
  const byTemplate = new Map<number, number>();
  const byKey = new Map<string, Array<{ ref: number; parentRef: number | null }>>();
  for (const n of file) {
    for (const t of n.templateIds) if (!byTemplate.has(t)) byTemplate.set(t, n.ref);
    for (const p of n.places) {
      if (!p.key) continue;
      const list = byKey.get(p.key) ?? [];
      list.push({ ref: n.ref, parentRef: p.parentRef });
      byKey.set(p.key, list);
    }
  }

  const refFor = new Map<number, number>();
  let ambiguous = 0;

  // Two rows tied to different template places are different places, whatever
  // they are called.
  const templateClash = (node: TransferAccountNode, ref: number) => {
    const f = byRef.get(ref)!;
    return node.templateIds.length > 0 && f.templateIds.length > 0 && !node.templateIds.some((t) => f.templateIds.includes(t));
  };

  for (const node of topDown(account)) {
    const viaTemplate = node.templateIds.map((t) => byTemplate.get(t)).find((r) => r != null);
    if (viaTemplate != null) {
      refFor.set(node.id, viaTemplate);
      continue;
    }

    const hits = node.keys.flatMap((k) => byKey.get(k) ?? []).filter((h) => !templateClash(node, h.ref));
    const refs = unique(hits.map((h) => h.ref));
    if (!refs.length) continue;

    // Under the same parent as in the file (current spot or feed origin).
    // `undefined` = this row's parent has no counterpart, so it can't decide.
    const parentRef = node.parentId == null ? null : refFor.get(node.parentId);
    if (parentRef !== undefined) {
      const sameParent = unique(hits.filter((h) => h.parentRef === parentRef).map((h) => h.ref));
      if (sameParent.length === 1) {
        refFor.set(node.id, sameParent[0]);
        continue;
      }
    }

    if (refs.length === 1) {
      refFor.set(node.id, refs[0]);
      continue;
    }
    const sameLevel = node.level ? refs.filter((r) => byRef.get(r)!.level === node.level) : [];
    if (sameLevel.length === 1) refFor.set(node.id, sameLevel[0]);
    else ambiguous++;
  }

  return { refFor, ambiguous };
}

/** Rows ordered parents first; rows in a parent loop come last. */
export function topDown<T extends { id: number; parentId: number | null }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depth = new Map<number, number>();
  const depthOf = (r: T): number => {
    const known = depth.get(r.id);
    if (known != null) return known;
    let d = 0;
    let cur = r.parentId;
    const seen = new Set([r.id]);
    while (cur != null && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      d++;
      cur = byId.get(cur)!.parentId;
    }
    depth.set(r.id, d);
    return d;
  };
  return [...rows].sort((a, b) => depthOf(a) - depthOf(b));
}

/** True when `ancestorId` is `id` or above it in the tree. */
export function isWithin(parentOf: Map<number, number | null>, id: number | null, ancestorId: number): boolean {
  for (let cur = id, hops = 0; cur != null && hops < 100; cur = parentOf.get(cur) ?? null, hops++) {
    if (cur === ancestorId) return true;
  }
  return false;
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

// ── File checks ──────────────────────────────────────────────────────────────
// The file comes from the browser, so every field is checked before use.

export const MAX_TRANSFER_ROWS = 50_000;

export function int(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
}

export function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function ints(v: unknown): number[] {
  return Array.isArray(v) ? v.map(int).filter((n): n is number => n != null) : [];
}

export function strings(v: unknown, max: number, limit = 50): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === 'string').map((s) => s.trim().slice(0, max)).filter(Boolean).slice(0, limit);
}

/** { en: "Marbella", es: "Marbella" } — language codes and text only. */
export function names(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [lang, text] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(lang) || typeof text !== 'string') continue;
    const t = text.trim().slice(0, 200);
    if (t) out[lang] = t;
  }
  return out;
}
