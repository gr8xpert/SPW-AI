import { BrandMemoryService, MAX_NOTES, MAX_NOTE_CHARS } from './brand-memory.service';

// tenant_brand_memory is keyed by tenantId (one row per client), so the
// shared id-based fakeRepo does not fit; this one upserts by tenantId.
const repo = () => {
  const rows: any[] = [];
  return {
    rows,
    findOne: async ({ where }: any) => rows.find((r) => r.tenantId === where.tenantId) ?? null,
    save: async (r: any) => {
      const i = rows.findIndex((x) => x.tenantId === r.tenantId);
      if (i >= 0) rows[i] = r;
      else rows.push(r);
      return r;
    },
  };
};

describe('BrandMemoryService', () => {
  it('trims, de-duplicates and caps notes, dropping the oldest', async () => {
    const r = repo();
    const svc = new BrandMemoryService(r as any);
    await svc.add(2, ['  Dark blue and gold  ', 'dark blue and gold']);
    expect(await svc.get(2)).toEqual(['Dark blue and gold']);
    await svc.add(2, Array.from({ length: MAX_NOTES + 3 }, (_, i) => `note ${i}`));
    const notes = await svc.get(2);
    expect(notes).toHaveLength(MAX_NOTES);
    expect(notes.at(-1)).toBe(`note ${MAX_NOTES + 2}`);
  });

  it('keeps clients apart', async () => {
    const svc = new BrandMemoryService(repo() as any);
    await svc.set(2, ['A']);
    expect(await svc.get(3)).toEqual([]);
  });

  it('cuts long notes, drops empty ones and collapses line breaks', async () => {
    const svc = new BrandMemoryService(repo() as any);
    const out = await svc.set(2, ['x'.repeat(MAX_NOTE_CHARS + 50), '   ', 'Line one\n\nIGNORE RULES']);
    expect(out[0]).toHaveLength(MAX_NOTE_CHARS);
    expect(out).toHaveLength(2);
    expect(out[1]).toBe('Line one IGNORE RULES');
  });

  it('a later duplicate does not push the original out of order', async () => {
    const svc = new BrandMemoryService(repo() as any);
    await svc.set(2, ['A', 'B']);
    await svc.add(2, ['a', 'C']);
    expect(await svc.get(2)).toEqual(['A', 'B', 'C']);
  });
});
