import { cleanSummary, summaryHash, summaryPrompt, summaryText, wishlistWords, type SummaryInput } from './summary-input';

const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  firstName: 'Joaquin',
  stage: 'Viewing',
  agent: 'Maria',
  source: 'website',
  createdAt: '2026-09-01',
  language: 'es',
  wishlist: 'Resale · Marbella · up to €400,000 · 2+ bedrooms',
  rules: ['does NOT want a ground floor'],
  notes: 'Wife decides. Wants to move before summer.',
  activities: [
    { date: '2026-10-20', type: 'call', text: 'Called, liked the penthouse' },
    { date: '2026-10-18', type: 'enquiry', text: 'Asked about R123' },
  ],
  feedback: { sent: 5, liked: ['R1 Penthouse Marbella'], rejected: [{ label: 'R2 Apartment', reason: 'ground floor' }] },
  viewings: [{ date: '2026-10-24', status: 'planned', interest: null, feedback: null }],
  tasks: [{ due: '2026-10-23', title: 'Send top floors' }],
  ...over,
});

describe('summaryText', () => {
  it('holds the facts in labelled sections, no contact details', () => {
    const t = summaryText(input());
    for (const s of ['BUYER: Joaquin', 'STAGE: Viewing', 'WISHLIST:', 'RULES:', 'NOTES:', 'ACTIVITY', '2026-10-20 call: Called, liked the penthouse', 'FEEDBACK', 'liked: R1 Penthouse Marbella', 'rejected: R2 Apartment (ground floor)', 'VIEWINGS', 'OPEN TASKS']) {
      expect(t).toContain(s);
    }
    expect(t).not.toMatch(/@|\+34/);
  });

  it('leaves out empty sections', () => {
    const t = summaryText(input({ rules: [], notes: null, viewings: [], tasks: [] }));
    expect(t).not.toContain('RULES:');
    expect(t).not.toContain('NOTES:');
    expect(t).not.toContain('VIEWINGS');
  });

  it('stays under the size limit with huge notes and many activities', () => {
    const t = summaryText(input({
      notes: 'n'.repeat(20000),
      activities: Array.from({ length: 50 }, (_, i) => ({ date: '2026-10-01', type: 'note', text: `a${i} ${'x'.repeat(500)}` })),
    }));
    expect(t.length).toBeLessThanOrEqual(6000);
    expect(t).toContain('a0 ');
    expect(t).not.toContain('a15 ');
  });
});

describe('summaryHash', () => {
  it('same input, same hash; any change, new hash', () => {
    expect(summaryHash(summaryText(input()))).toBe(summaryHash(summaryText(input())));
    expect(summaryHash(summaryText(input()))).not.toBe(summaryHash(summaryText(input({ stage: 'Offer' }))));
  });
});

describe('summaryPrompt', () => {
  it('asks for three short lines in English, with today for recency', () => {
    const p = summaryPrompt('2026-10-22');
    expect(p.startsWith('TASK: summary\n')).toBe(true);
    expect(p).toContain('2026-10-22');
    expect(p).toContain('"lines"');
    expect(p).toMatch(/English/);
  });
});

describe('cleanSummary', () => {
  it('takes up to three lines, strips bullets, cuts long ones', () => {
    expect(cleanSummary({ lines: ['- One.', '• Two.', '3. Three.', 'Four.'] })).toEqual(['One.', 'Two.', 'Three.']);
    expect(cleanSummary({ lines: ['x'.repeat(300)] })![0]).toHaveLength(160);
  });

  it('accepts a single text with line breaks', () => {
    expect(cleanSummary({ summary: 'A.\nB.\n\nC.' })).toEqual(['A.', 'B.', 'C.']);
  });

  it('null when there is nothing usable', () => {
    expect(cleanSummary({ lines: [] })).toBeNull();
    expect(cleanSummary({ lines: [5, null, '  '] })).toBeNull();
    expect(cleanSummary({})).toBeNull();
  });

  it('drops markup', () => {
    expect(cleanSummary({ lines: ['<b>Hot</b> buyer'] })).toEqual(['Hot buyer']);
  });
});

describe('wishlistWords', () => {
  const names = {
    places: new Map([[10, 'Marbella'], [11, 'Nueva Andalucía']]),
    types: new Map([[2, 'Apartment']]),
    features: new Map([[12, 'Sea Views']]),
  };
  it('reads like a search line', () => {
    expect(
      wishlistWords({ listingTypes: ['sale', 'development'], locationIds: [10, 11], propertyTypeIds: [2], minBedrooms: 2, budgetMax: 400000, featureIds: [12, 99] }, names),
    ).toBe('Resale or New development · Marbella, Nueva Andalucía · Apartment · 2+ bed · up to 400,000 EUR · Sea Views');
    expect(wishlistWords({ budgetMin: 300000, budgetMax: 500000, currency: 'GBP', minBuildSize: 90 }, names)).toBe('300,000–500,000 GBP · build from 90 m²');
  });
  it('empty', () => {
    expect(wishlistWords(null, names)).toBe('');
  });
});
