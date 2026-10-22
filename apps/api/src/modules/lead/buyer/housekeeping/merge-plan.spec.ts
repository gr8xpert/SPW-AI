import { mergeAgents, planSuggestions, type MergeSuggestion } from './merge-plan';

const d = new Date('2026-10-20T10:00:00Z');
const s = (id: number, propertyId: number, patch: Partial<MergeSuggestion> = {}): MergeSuggestion => ({
  id,
  propertyId,
  sentAt: null,
  openedAt: null,
  clickedAt: null,
  likedAt: null,
  rejectedAt: null,
  rejectReason: null,
  viewingAt: null,
  offerAt: null,
  ...patch,
});

describe('planSuggestions', () => {
  it('moves new properties, keeps the further one on a clash', () => {
    const plan = planSuggestions(
      [s(1, 100, { sentAt: d }), s(2, 200, { sentAt: d, likedAt: d })],
      [s(11, 100, { sentAt: d, viewingAt: d }), s(12, 200, { sentAt: d }), s(13, 300)],
    );
    expect(plan.move).toEqual([13]);
    expect(plan.replace).toEqual([
      { keep: 11, drop: 1 },
      { keep: 2, drop: 12 },
    ]);
  });

  it('a tie keeps the kept buyer\'s row', () => {
    expect(planSuggestions([s(1, 5)], [s(9, 5)]).replace).toEqual([{ keep: 1, drop: 9 }]);
  });
});

describe('mergeAgents', () => {
  it('union without the main agent; the source main agent becomes related', () => {
    expect(mergeAgents(1, [2, 3], [3, 4], 5)).toEqual([2, 3, 4, 5]);
    expect(mergeAgents(5, [2], [], 5)).toEqual([2]);
    expect(mergeAgents(null, [], [], null)).toEqual([]);
  });
});
