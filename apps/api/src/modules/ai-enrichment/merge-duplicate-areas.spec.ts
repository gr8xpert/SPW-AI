import { AiEnrichmentService } from './ai-enrichment.service';

// Exercises mergeDuplicateAreas with hand-rolled fakes rather than a Nest
// testing module + live DB — the logic under test is duplicate detection and
// keeper selection, not persistence.

type Row = { id: number; slug: string; parentId: number | null; name: { en: string }; level: string };

function makeService(rows: Row[], aiAnswer: Record<string, string> | null) {
  const moves: Array<{ ids: number[]; parentId: number | null }> = [];

  const locationRepository = {
    find: async ({ where }: any) => {
      if (where?.level === 'area') return rows.filter((r) => r.level === 'area');
      if (where?.id) {
        // TypeORM In([...]) — read the wrapped values off the operator.
        const wanted: number[] = where.id._value ?? where.id.value ?? [];
        return rows.filter((r) => wanted.includes(r.id));
      }
      return [];
    },
  };

  const locationService = {
    bulkMove: async (_tenantId: number, ids: number[], parentId: number | null) => {
      moves.push({ ids, parentId });
      return { count: ids.length, merged: ids.length };
    },
  };

  const svc = new (AiEnrichmentService as any)(
    locationRepository,
    {},
    {},
    {},
    locationService,
  ) as AiEnrichmentService;

  (svc as any).askAiForCanonicalAreaProvince = async () => aiAnswer;

  return { svc, moves };
}

const MALAGA = { id: 1, slug: 'malaga', parentId: null, name: { en: 'Málaga' }, level: 'province' };
const CADIZ = { id: 2, slug: 'cadiz', parentId: null, name: { en: 'Cádiz' }, level: 'province' };
const HUELVA = { id: 3, slug: 'huelva', parentId: null, name: { en: 'Huelva' }, level: 'province' };

const cdsMalaga = { id: 10, slug: 'costa-del-sol', parentId: 1, name: { en: 'Costa del Sol' }, level: 'area' };
const cdsCadiz = { id: 11, slug: 'costa-del-sol', parentId: 2, name: { en: 'Costa del Sol' }, level: 'area' };
const luzCadiz = { id: 12, slug: 'costa-de-la-luz', parentId: 2, name: { en: 'Costa de la Luz' }, level: 'area' };
const luzHuelva = { id: 13, slug: 'costa-de-la-luz', parentId: 3, name: { en: 'Costa de la Luz' }, level: 'area' };

const run = (svc: AiEnrichmentService) => (svc as any).mergeDuplicateAreas(1) as Promise<number>;

describe('mergeDuplicateAreas', () => {
  // The reported bug.
  it('folds the duplicate into the province the model picks', async () => {
    const { svc, moves } = makeService(
      [MALAGA, CADIZ, cdsMalaga, cdsCadiz],
      { 'Costa del Sol': 'Málaga' },
    );

    await expect(run(svc)).resolves.toBe(1);
    expect(moves).toEqual([{ ids: [11], parentId: 1 }]); // Cádiz node → Málaga
  });

  // Costa de la Luz genuinely spans Huelva and Cádiz; the prompt tells the model
  // to omit those, and an omission must mean "leave it alone".
  it('leaves an area alone when the model omits it', async () => {
    const { svc, moves } = makeService([CADIZ, HUELVA, luzCadiz, luzHuelva], {});

    await expect(run(svc)).resolves.toBe(0);
    expect(moves).toEqual([]);
  });

  it('does nothing when the model returns nothing at all', async () => {
    const { svc, moves } = makeService([MALAGA, CADIZ, cdsMalaga, cdsCadiz], null);

    await expect(run(svc)).resolves.toBe(0);
    expect(moves).toEqual([]);
  });

  // Guard against a hallucinated province: if the answer names somewhere none
  // of the duplicates actually sit under, skip rather than invent a node.
  it('skips when the model names a province that is not a candidate', async () => {
    const { svc, moves } = makeService(
      [MALAGA, CADIZ, cdsMalaga, cdsCadiz],
      { 'Costa del Sol': 'Sevilla' },
    );

    await expect(run(svc)).resolves.toBe(0);
    expect(moves).toEqual([]);
  });

  it('ignores a same-name area that is not actually duplicated', async () => {
    const { svc, moves } = makeService([MALAGA, cdsMalaga], { 'Costa del Sol': 'Málaga' });

    await expect(run(svc)).resolves.toBe(0);
    expect(moves).toEqual([]);
  });

  it('handles several duplicated areas in one pass', async () => {
    const { svc, moves } = makeService(
      [MALAGA, CADIZ, HUELVA, cdsMalaga, cdsCadiz, luzCadiz, luzHuelva],
      { 'Costa del Sol': 'Málaga', 'Costa de la Luz': 'Cádiz' },
    );

    await expect(run(svc)).resolves.toBe(2);
    expect(moves).toEqual([
      { ids: [11], parentId: 1 },
      { ids: [13], parentId: 2 },
    ]);
  });

  it('is a no-op for a tenant with fewer than two areas', async () => {
    const { svc, moves } = makeService([MALAGA, cdsMalaga], { 'Costa del Sol': 'Málaga' });
    await expect(run(svc)).resolves.toBe(0);
    expect(moves).toEqual([]);
  });
});
