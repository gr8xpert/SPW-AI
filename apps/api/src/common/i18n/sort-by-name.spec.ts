import { bySortOrderThenName, i18nName } from './sort-by-name';

type Row = { sortOrder?: number | null; name?: unknown };

const sorted = (rows: Row[]) => [...rows].sort(bySortOrderThenName).map((r) => i18nName(r.name));

describe('i18nName', () => {
  it('prefers en, then the first non-empty value', () => {
    expect(i18nName({ en: 'Málaga', es: 'Malaga' })).toBe('Málaga');
    expect(i18nName({ es: 'Cádiz' })).toBe('Cádiz');
    expect(i18nName({ en: '   ', es: 'Roche' })).toBe('Roche');
  });

  it('survives the shapes that reach it from JSON columns', () => {
    expect(i18nName('Marbella')).toBe('Marbella');
    expect(i18nName(null)).toBe('');
    expect(i18nName(undefined)).toBe('');
    expect(i18nName({})).toBe('');
  });
});

describe('bySortOrderThenName', () => {
  // The real failure: nothing had been dragged, so every row carried the
  // default sortOrder 0 and the effective order was insertion order.
  it('sorts alphabetically when no manual order has been set', () => {
    const rows: Row[] = [
      { sortOrder: 0, name: { en: 'Costa del Sol' } },
      { sortOrder: 0, name: { en: 'Benalup-Casas Viejas' } },
      { sortOrder: 0, name: { en: 'Puente Mayorga' } },
      { sortOrder: 0, name: { en: 'Palmones' } },
      { sortOrder: 0, name: { en: 'Alcalá del Valle' } },
      { sortOrder: 0, name: { en: 'Roche' } },
      { sortOrder: 0, name: { en: 'Costa Ballena' } },
    ];

    expect(sorted(rows)).toEqual([
      'Alcalá del Valle',
      'Benalup-Casas Viejas',
      'Costa Ballena',
      'Costa del Sol',
      'Palmones',
      'Puente Mayorga',
      'Roche',
    ]);
  });

  // Accents must fold, or Spanish place names scatter to the end of the list.
  it('folds accents rather than sorting them after z', () => {
    const rows: Row[] = [
      { sortOrder: 0, name: { en: 'Zahara' } },
      { sortOrder: 0, name: { en: 'Álora' } },
      { sortOrder: 0, name: { en: 'Cádiz' } },
      { sortOrder: 0, name: { en: 'Cordoba' } },
    ];
    expect(sorted(rows)).toEqual(['Álora', 'Cádiz', 'Cordoba', 'Zahara']);
  });

  it('orders numbered names naturally, not lexically', () => {
    const rows: Row[] = [
      { sortOrder: 0, name: { en: 'Zone 10' } },
      { sortOrder: 0, name: { en: 'Zone 2' } },
    ];
    expect(sorted(rows)).toEqual(['Zone 2', 'Zone 10']);
  });

  // Drag-to-reorder writes explicit sortOrder values; those must still win, or
  // the feature silently stops working.
  it('lets a manual drag order override alphabetical', () => {
    const rows: Row[] = [
      { sortOrder: 2, name: { en: 'Alpha' } },
      { sortOrder: 1, name: { en: 'Zulu' } },
    ];
    expect(sorted(rows)).toEqual(['Zulu', 'Alpha']);
  });

  it('falls back to alphabetical only within the same sortOrder group', () => {
    const rows: Row[] = [
      { sortOrder: 1, name: { en: 'Delta' } },
      { sortOrder: 0, name: { en: 'Yankee' } },
      { sortOrder: 1, name: { en: 'Bravo' } },
      { sortOrder: 0, name: { en: 'Xray' } },
    ];
    expect(sorted(rows)).toEqual(['Xray', 'Yankee', 'Bravo', 'Delta']);
  });

  it('treats a missing sortOrder as 0 rather than throwing', () => {
    const rows: Row[] = [
      { name: { en: 'Beta' } },
      { sortOrder: null, name: { en: 'Alpha' } },
    ];
    expect(sorted(rows)).toEqual(['Alpha', 'Beta']);
  });
});
