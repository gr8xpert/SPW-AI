import { UnmatchedReviewService } from './unmatched-review.service';
import { locationKey } from './location-name';
import { TemplateIndex } from './location-template.resolver';

// The AI review of unknown feed names: it can only point at places it was
// shown, a failed call is retried later, and after a feed import only safe
// answers are applied without a person — for every client that sent the name.

const n = (id: number, parentId: number | null, level: string, name: string, lat: number | null = null, lng: number | null = null) => ({
  id, parentId, level, name, nameKey: locationKey(name), aliases: null, status: 'ok', lat, lng,
});
const TEMPLATE = [
  n(1, null, 'region', 'Valencia Community'),
  n(2, 1, 'province', 'Alicante'),
  n(3, 2, 'area', 'Marina Alta'),
  n(4, 3, 'municipality', "L'Atzúbia", 38.8475, -0.1519),
  n(5, 4, 'town', "L'Atzúbia", 38.8475, -0.1519),
  n(6, 3, 'municipality', 'Jalón', 38.739, -0.0084),
];
const entry = (id: number, name: string, extra: Record<string, any> = {}) => ({
  id, name, subName: null, provider: 'resales', placedUnderNodeId: 2, lat: null, lng: null,
  dismissed: false, aiAttempted: false, resolvedNodeId: null, aiProposal: null, tenantIds: [7, 8], ...extra,
});

function makeService(answer: Record<string, any> | null) {
  const template = {
    loadIndex: jest.fn().mockResolvedValue(new TemplateIndex(TEMPLATE as any)),
    linkUnmatchedAsAlias: jest.fn().mockResolvedValue({}),
    addTownForUnmatched: jest.fn().mockResolvedValue({}),
    dismissUnmatched: jest.fn(),
    reapplyTenants: jest.fn().mockResolvedValue({ relocated: 0, cleaned: 0 }),
    setUnmatchedReviewer: jest.fn(),
  };
  const unmatchedRepository = { update: jest.fn() };
  const ai = { completeJson: jest.fn().mockResolvedValue(answer) };
  const svc = new UnmatchedReviewService(unmatchedRepository as any, {} as any, template as any, ai as any);
  return { svc, template, unmatchedRepository, ai };
}

describe('AI review of unknown feed names', () => {
  it('a failed AI call stores nothing, so the name is asked again next time', async () => {
    const { svc, unmatchedRepository } = makeService(null);
    const r = await svc.review([entry(1, 'ADSUBIA')] as any);
    expect(r).toEqual({ answered: 0, failed: 1 });
    expect(unmatchedRepository.update).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ aiAttempted: true }));
  });

  it('after an import, applies a "same" answer near the listings and re-sorts every client that sent it', async () => {
    const { svc, template } = makeService({ 1: { action: 'same', id: 'P1', reason: 'Valencian spelling' } });
    const e = entry(1, 'ADSUBIA', { lat: 38.85, lng: -0.15 });
    const r = await svc.reviewAndApply([e] as any, 7);
    expect(template.linkUnmatchedAsAlias).toHaveBeenCalledWith(1, expect.any(Number), 'ai');
    expect(r).toEqual({ applied: 1, tenantIds: [7, 8] });
  });

  it('keeps a "same" answer without GPS for a person to accept', async () => {
    const { svc, template, unmatchedRepository } = makeService({ 1: { action: 'same', id: 'P1' } });
    const r = await svc.reviewAndApply([entry(1, 'ADSUBIA')] as any, 7);
    expect(r.applied).toBe(0);
    expect(template.linkUnmatchedAsAlias).not.toHaveBeenCalled();
    expect(unmatchedRepository.update).toHaveBeenCalledWith({ id: 1 }, expect.objectContaining({ aiProposal: expect.objectContaining({ action: 'same' }) }));
  });

  it('never adds a new town or dismisses on its own: both wait for Super Admin', async () => {
    const { svc, template, unmatchedRepository } = makeService({
      1: { action: 'new', id: 'M2', reason: 'village in Jalón' },
      2: { action: 'dismiss', reason: 'not a place' },
    });
    const r = await svc.reviewAndApply([entry(1, 'Les Planes'), entry(2, 'Rural location')] as any, 7);
    expect(template.addTownForUnmatched).not.toHaveBeenCalled();
    expect(template.dismissUnmatched).not.toHaveBeenCalled();
    expect(r.applied).toBe(0);
    // The suggestion is kept for Super Admin to accept.
    expect(unmatchedRepository.update).toHaveBeenCalledWith({ id: 1 }, expect.objectContaining({ aiProposal: expect.objectContaining({ action: 'new' }) }));
  });

  it('ignores an id the model was not shown', async () => {
    const { svc, template } = makeService({ 1: { action: 'new', id: 'M99' } });
    const r = await svc.reviewAndApply([entry(1, 'Somewhere')] as any, 7);
    expect(r.applied).toBe(0);
    expect(template.addTownForUnmatched).not.toHaveBeenCalled();
  });
});
