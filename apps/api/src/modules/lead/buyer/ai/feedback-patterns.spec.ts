import { classifyFeedback, feedbackPatterns, type FeedbackProperty } from './feedback-patterns';

const prop = (over: Partial<FeedbackProperty>): FeedbackProperty => ({
  id: 1, verdict: 'liked', features: [], floor: { ground: null, top: null }, propertyTypeId: 2, townId: 10, ...over,
});

describe('classifyFeedback', () => {
  it('liked: like, interested, or a viewing at 4–5', () => {
    expect(classifyFeedback({ likedAt: new Date(), rejectedAt: null, status: 'sent' }, null)).toBe('liked');
    expect(classifyFeedback({ likedAt: null, rejectedAt: null, status: 'interested' }, null)).toBe('liked');
    expect(classifyFeedback({ likedAt: null, rejectedAt: null, status: 'visited' }, 4)).toBe('liked');
  });

  it('rejected: reject, not interested, or a viewing at 1–2; the newest word wins', () => {
    expect(classifyFeedback({ likedAt: null, rejectedAt: new Date(), status: 'sent' }, null)).toBe('rejected');
    expect(classifyFeedback({ likedAt: null, rejectedAt: null, status: 'not_interested' }, null)).toBe('rejected');
    expect(classifyFeedback({ likedAt: null, rejectedAt: null, status: 'visited' }, 2)).toBe('rejected');
    expect(classifyFeedback({ likedAt: new Date('2026-10-01'), rejectedAt: new Date('2026-10-05'), status: 'sent' }, null)).toBe('rejected');
    expect(classifyFeedback({ likedAt: new Date('2026-10-06'), rejectedAt: new Date('2026-10-05'), status: 'sent' }, null)).toBe('liked');
  });

  it('nothing said = null', () => {
    expect(classifyFeedback({ likedAt: null, rejectedAt: null, status: 'sent' }, 3)).toBeNull();
  });
});

describe('feedbackPatterns', () => {
  const ground = { ground: true, top: false };
  const sea = 12;
  const props: FeedbackProperty[] = [
    prop({ id: 1, verdict: 'rejected', floor: ground }),
    prop({ id: 2, verdict: 'rejected', floor: ground }),
    prop({ id: 3, verdict: 'rejected', floor: ground, propertyTypeId: 5 }),
    prop({ id: 4, verdict: 'rejected', floor: ground, propertyTypeId: 5 }),
    prop({ id: 5, verdict: 'liked', features: [sea, 3], floor: { ground: false, top: true } }),
    prop({ id: 6, verdict: 'liked', features: [sea] }),
    prop({ id: 7, verdict: 'liked', features: [sea, 3] }),
  ];

  it('finds the plan example: rejected 4 ground floors, liked 3 with sea views', () => {
    const out = feedbackPatterns(props, { featureIds: [1] }, [], []);
    const floor = out.find((s) => s.key === 'rule:floor:avoid:ground');
    const feature = out.find((s) => s.key === `feature:${sea}`);
    expect(floor).toMatchObject({ kind: 'rule', rule: { kind: 'floor', mode: 'avoid', value: 'ground' }, rejected: 4, rejectedTotal: 4, liked: 0 });
    expect(feature).toMatchObject({ kind: 'feature', featureId: sea, liked: 3, likedTotal: 3 });
    // Feature 3 is in 2 of 3 liked (67 %): also suggested.
    expect(out.some((s) => s.key === 'feature:3')).toBe(true);
    // Type 5 rejected twice, never liked.
    expect(out.find((s) => s.key === 'rule:type:avoid:5')).toMatchObject({ rule: { kind: 'type', mode: 'avoid', propertyTypeId: 5 }, rejected: 2 });
  });

  it('strongest first, at most five', () => {
    const out = feedbackPatterns(props, null, [], []);
    expect(out[0].key).toBe('rule:floor:avoid:ground');
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it('skips what the wishlist or rules already say, and what was dismissed', () => {
    const out = feedbackPatterns(
      props,
      { featureIds: [sea] },
      [{ id: 'floor:avoid:ground', kind: 'floor', mode: 'avoid', value: 'ground', text: 'x', strength: 'hard' }],
      ['feature:3'],
    );
    expect(out.map((s) => s.key)).toEqual(['rule:type:avoid:5']);
  });

  it('needs two of a kind and no liked counter-example', () => {
    const few = [prop({ id: 1, verdict: 'rejected', floor: ground }), prop({ id: 2, verdict: 'liked', floor: ground }), prop({ id: 3, verdict: 'rejected', floor: ground })];
    expect(feedbackPatterns(few, null, [], []).some((s) => s.key === 'rule:floor:avoid:ground')).toBe(false);
    expect(feedbackPatterns([prop({ id: 1, verdict: 'liked', features: [sea] })], null, [], [])).toEqual([]);
  });

  it('never suggests avoiding the only wished town', () => {
    const inTown = [prop({ id: 1, verdict: 'rejected', townId: 10 }), prop({ id: 2, verdict: 'rejected', townId: 10 })];
    expect(feedbackPatterns(inTown, { locationIds: [10] }, [], []).some((s) => s.key === 'rule:place:avoid:10')).toBe(false);
    expect(feedbackPatterns(inTown, { locationIds: [10, 11] }, [], []).some((s) => s.key === 'rule:place:avoid:10')).toBe(true);
  });
});
