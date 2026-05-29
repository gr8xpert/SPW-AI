import type { Feature } from '@/types';

export function resolveFeatures(
  ids: number[] | null | undefined,
  catalog: Feature[],
): Feature[] {
  if (!ids?.length) return [];
  const byId = new Map(catalog.map((f) => [f.id, f]));
  const out: Feature[] = [];
  for (const id of ids) {
    const f = byId.get(id);
    if (f) out.push(f);
  }
  return out;
}
