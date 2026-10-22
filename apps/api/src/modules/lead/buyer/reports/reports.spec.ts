import { conversion, expectedRevenue, funnel, median, monthKeys, sourceSeries, stageProbabilities, type ReportStage } from './reports';

const stages: ReportStage[] = [
  { id: 1, name: 'New lead', sortOrder: 0, kind: 'open', probability: null },
  { id: 2, name: 'Contacted', sortOrder: 1, kind: 'open', probability: null },
  { id: 3, name: 'Viewing', sortOrder: 2, kind: 'open', probability: 60 },
  { id: 4, name: 'Won', sortOrder: 3, kind: 'won', probability: null },
  { id: 5, name: 'Lost', sortOrder: 4, kind: 'lost', probability: null },
];

describe('monthKeys', () => {
  it('last N months, oldest first, across a year', () => {
    expect(monthKeys(new Date('2026-02-10T12:00:00Z'), 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('uses the agency time zone', () => {
    expect(monthKeys(new Date('2026-10-31T23:30:00Z'), 1, 'Europe/Madrid')).toEqual(['2026-11']);
  });
});

describe('sourceSeries', () => {
  it('zero-fills and orders sources by total', () => {
    const r = sourceSeries(['2026-09', '2026-10'], [
      { month: '2026-10', source: 'website', n: 3 },
      { month: '2026-09', source: 'odoo', n: 1 },
      { month: '2026-10', source: 'odoo', n: 1 },
      { month: '2026-10', source: 'manual', n: 4 },
    ]);
    expect(r.sources).toEqual(['manual', 'website', 'odoo']);
    expect(r.series).toEqual([
      { month: '2026-09', manual: 0, website: 0, odoo: 1 },
      { month: '2026-10', manual: 4, website: 3, odoo: 1 },
    ]);
  });
});

describe('funnel', () => {
  it('counts each buyer at every stage up to the furthest reached', () => {
    const f = funnel(stages, [
      { stageId: 1, history: [] },
      { stageId: 2, history: ['New lead'] },
      { stageId: 5, history: ['contacted', 'Viewing'] }, // lost after a viewing
      { stageId: 4, history: [] }, // won
      { stageId: null, history: [] },
    ]);
    expect(f.stages).toEqual([
      { stageId: 1, name: 'New lead', count: 4 },
      { stageId: 2, name: 'Contacted', count: 3 },
      { stageId: 3, name: 'Viewing', count: 2 },
    ]);
    expect(f.won).toBe(1);
    expect(f.lost).toBe(1);
  });
});

describe('probabilities + expected revenue', () => {
  it('defaults spread 10–90 over open stages; stored wins', () => {
    const p = stageProbabilities(stages);
    expect([p.get(1), p.get(2), p.get(3), p.get(4), p.get(5)]).toEqual([10, 50, 60, 100, 0]);
  });

  it('one open stage → 50%', () => {
    expect(stageProbabilities([{ id: 9, name: 'Only', sortOrder: 0, kind: 'open', probability: null }]).get(9)).toBe(50);
  });

  it('Σ value × probability, skipping buyers without a value', () => {
    const p = stageProbabilities(stages);
    expect(expectedRevenue([
      { stageId: 1, dealValue: 100000 },
      { stageId: 3, dealValue: 500000 },
      { stageId: 2, dealValue: null },
      { stageId: null, dealValue: 900000 },
    ], p)).toBe(310000);
  });
});

describe('median + conversion', () => {
  it('median', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('conversion %', () => {
    expect(conversion(1, 3)).toBe(25);
    expect(conversion(0, 0)).toBeNull();
  });
});
