// Possible duplicate buyers: same phone (last 9 digits, at least 7 digits so
// "123" doesn't match everyone) or same first + last name (accents, case and
// spaces ignored). Groups are built with union-find so A~B by phone and B~C
// by name end up in one group. Pure.

export interface DuplicateCandidate {
  id: number;
  firstName: string | null;
  lastName: string | null;
  phones: (string | null)[];
}

export interface DuplicateGroup {
  ids: number[];
  reasons: ('phone' | 'name')[];
}

export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-9) : null;
}

export function nameKey(first: string | null | undefined, last: string | null | undefined): string | null {
  const norm = (s: string | null | undefined) =>
    (s ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const f = norm(first);
  const l = norm(last);
  return f && l ? `${f}|${l}` : null;
}

export function findDuplicates(rows: DuplicateCandidate[]): DuplicateGroup[] {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const reasons = new Map<number, Set<'phone' | 'name'>>();
  rows.forEach((r) => parent.set(r.id, r.id));
  const union = (a: number, b: number, why: 'phone' | 'name') => {
    const ra = find(a);
    const rb = find(b);
    const keep = Math.min(ra, rb);
    const drop = Math.max(ra, rb);
    const set = new Set([...(reasons.get(ra) ?? []), ...(reasons.get(rb) ?? []), why]);
    parent.set(drop, keep);
    reasons.set(keep, set);
  };

  const byKey = new Map<string, number>();
  for (const r of rows) {
    const keys: [string, 'phone' | 'name'][] = [];
    for (const p of new Set(r.phones.map(phoneKey).filter((k): k is string => !!k))) keys.push([`p:${p}`, 'phone']);
    const n = nameKey(r.firstName, r.lastName);
    if (n) keys.push([`n:${n}`, 'name']);
    for (const [k, why] of keys) {
      const seen = byKey.get(k);
      if (seen === undefined) byKey.set(k, r.id);
      else if (find(seen) !== find(r.id)) union(seen, r.id, why);
      else reasons.set(find(r.id), new Set([...(reasons.get(find(r.id)) ?? []), why]));
    }
  }

  const groups = new Map<number, number[]>();
  for (const r of rows) {
    const root = find(r.id);
    groups.set(root, [...(groups.get(root) ?? []), r.id]);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([root, ids]) => ({ ids: ids.sort((a, b) => a - b), reasons: [...(reasons.get(root) ?? [])].sort() }))
    .sort((a, b) => a.ids[0] - b.ids[0]);
}
