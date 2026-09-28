import { LocationTemplateService } from './location-template.service';
import { locationKey } from './location-name';

// AI may only place an unknown town under a municipality of the template's own
// list, every answer becomes an "AI suggested" node, and a name is asked once.
function makeService(nodes: any[], answer: Record<string, any> | null) {
  const svc = Object.create(LocationTemplateService.prototype) as any;
  svc.logger = { log: jest.fn(), warn: jest.fn() };
  const saved: any[] = [];
  svc.nodeRepository = {
    find: jest.fn().mockResolvedValue(nodes),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => {
      const row = { id: 900 + saved.length, ...x };
      saved.push(row);
      return row;
    }),
  };
  svc.unmatchedRepository = { update: jest.fn() };
  svc.aiEnrichmentService = { completeJson: jest.fn().mockResolvedValue(answer) };
  return { svc, saved };
}

const n = (id: number, parentId: number | null, level: string, name: string) => ({
  id, parentId, level, name, nameKey: locationKey(name), aliases: null, status: 'ok',
});
const TEMPLATE = [
  n(1, null, 'region', 'Andalucía'),
  n(2, 1, 'province', 'Málaga'),
  n(3, 2, 'area', 'Costa del Sol'),
  n(4, 3, 'municipality', 'Mijas'),
  n(5, 3, 'municipality', 'Fuengirola'),
];
const entry = (id: number, name: string, extra: Record<string, any> = {}) => ({
  id, name, subName: null, provider: 'resales', area: 'Costa del Sol', placedUnderNodeId: 3,
  lat: 36.5, lng: -4.7, dismissed: false, aiAttempted: false, ...extra,
});

describe('AI placement of unknown towns', () => {
  it('adds an AI-suggested town under the chosen municipality', async () => {
    const { svc, saved } = makeService(TEMPLATE, { '1': 'Mijas' });
    const placed = await svc.askAiForUnmatched(6, [entry(10, 'El Faro')]);
    expect(placed).toBe(1);
    expect(saved[0]).toMatchObject({ parentId: 4, level: 'town', name: 'El Faro', status: 'ai_suggested', lat: 36.5 });
    expect(svc.unmatchedRepository.update).toHaveBeenCalledWith({ id: 10 }, { resolvedNodeId: saved[0].id });
    const prompt = svc.aiEnrichmentService.completeJson.mock.calls[0][1] as string;
    expect(prompt).toContain('"El Faro" in Andalucía > Málaga > Costa del Sol (listings around 36.5, -4.7)');
    expect(prompt).toContain('Municipalities: Mijas; Fuengirola');
  });

  it('ignores a municipality that is not in the list', async () => {
    const { svc, saved } = makeService(TEMPLATE, { '1': 'Marbella' });
    expect(await svc.askAiForUnmatched(6, [entry(10, 'El Faro')])).toBe(0);
    expect(saved).toHaveLength(0);
  });

  it('asks only once per name, and not for dismissed or deeper unknowns', async () => {
    const { svc } = makeService(TEMPLATE, {});
    await svc.askAiForUnmatched(6, [
      entry(11, 'Asked Before', { aiAttempted: true }),
      entry(12, 'Dismissed', { dismissed: true }),
      entry(13, 'Urbanization under a known town', { placedUnderNodeId: 4 }),
    ]);
    expect(svc.aiEnrichmentService.completeJson).not.toHaveBeenCalled();
  });

  it('marks entries as asked even when AI gives no answer', async () => {
    const { svc } = makeService(TEMPLATE, null);
    await svc.askAiForUnmatched(6, [entry(14, 'Somewhere')]);
    expect(svc.unmatchedRepository.update).toHaveBeenCalledWith({ id: expect.anything() }, { aiAttempted: true });
  });
});
