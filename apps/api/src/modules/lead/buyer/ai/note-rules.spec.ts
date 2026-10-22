import type { NoteRule } from '@spm/shared';
import { checkRules, cleanRules, floorFacts, ruleKey, rulePenalty, rulesHash, type RuleFacts, type RuleLists } from './note-rules';

const lists: RuleLists = {
  featureIds: new Set([1, 3, 12]),
  typeIds: new Set([1, 2, 3]),
  locationIds: new Set([10, 11]),
  resolvePlace: (name) => (name.toLowerCase().includes('san pedro') ? 10 : null),
};

describe('cleanRules', () => {
  it('keeps valid rules and gives each its key as id', () => {
    const out = cleanRules(
      [
        { kind: 'floor', mode: 'avoid', value: 'ground', text: 'does NOT want a ground floor', strength: 'hard' },
        { kind: 'feature', mode: 'require', featureId: 1, text: 'must have sea views' },
        { kind: 'max', field: 'price', value: '450000', text: 'max 450k', strength: 'soft' },
        { kind: 'place', mode: 'avoid', place: 'San Pedro', text: 'not San Pedro' },
      ],
      lists,
    );
    expect(out).toEqual([
      { id: 'floor:avoid:ground', kind: 'floor', mode: 'avoid', value: 'ground', text: 'does NOT want a ground floor', strength: 'hard' },
      { id: 'feature:require:1', kind: 'feature', mode: 'require', featureId: 1, text: 'must have sea views', strength: 'hard' },
      { id: 'max:price', kind: 'max', field: 'price', value: 450000, text: 'max 450k', strength: 'soft' },
      { id: 'place:avoid:10', kind: 'place', mode: 'avoid', locationId: 10, text: 'not San Pedro', strength: 'hard' },
    ]);
  });

  it('drops invented ids, unknown kinds/fields, bad values and duplicates', () => {
    const out = cleanRules(
      [
        { kind: 'feature', mode: 'avoid', featureId: 999, text: 'x' },
        { kind: 'type', mode: 'require', propertyTypeId: 1, text: 'only villas' }, // type rules only avoid
        { kind: 'colour', mode: 'avoid', value: 'red', text: 'x' },
        { kind: 'max', field: 'ceilingHeight', value: 3, text: 'x' },
        { kind: 'max', field: 'price', value: -5, text: 'x' },
        { kind: 'floor', mode: 'avoid', value: 'basement', text: 'x' },
        { kind: 'place', mode: 'avoid', place: 'Atlantis', text: 'x' },
        { kind: 'place', mode: 'avoid', locationId: 99, text: 'x' },
        { kind: 'type', mode: 'avoid', propertyTypeId: 2, text: 'no apartments' },
        { kind: 'type', mode: 'avoid', propertyTypeId: 2, text: 'again' },
        'nonsense',
        null,
      ],
      lists,
    );
    expect(out.map((r) => r.id)).toEqual(['type:avoid:2']);
    expect(out[0].text).toBe('no apartments');
  });

  it('accepts a saved locationId as is, caps text and count', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ kind: 'min', field: 'bedrooms', value: i + 1, text: 't'.repeat(300) }));
    expect(cleanRules([{ kind: 'place', mode: 'avoid', locationId: 11, text: 'no' }], lists)[0].id).toBe('place:avoid:11');
    const out = cleanRules(many, lists);
    expect(out).toHaveLength(1); // one rule per key: min:bedrooms
    expect(out[0].text).toHaveLength(200);
    const distinct = cleanRules(
      Array.from({ length: 30 }, (_, i) => ({ kind: 'feature', mode: i % 2 ? 'avoid' : 'require', featureId: [1, 3, 12][i % 3], text: 'x' })),
      lists,
    );
    expect(distinct.length).toBeLessThanOrEqual(20);
  });

  it('a rule needs some words', () => {
    expect(cleanRules([{ kind: 'floor', mode: 'avoid', value: 'top', text: '  ' }], lists)).toEqual([]);
  });

  it('keeps the first of two rules that contradict each other', () => {
    const out = cleanRules(
      [
        { kind: 'floor', mode: 'avoid', value: 'ground', text: 'no ground floor' },
        { kind: 'floor', mode: 'require', value: 'ground', text: 'ground floor only' },
      ],
      lists,
    );
    expect(out.map((r) => r.id)).toEqual(['floor:avoid:ground']);
  });
});

describe('ruleKey', () => {
  it('names the rule by what it tests', () => {
    expect(ruleKey({ kind: 'min', field: 'builtYear', value: 2010 })).toBe('min:builtYear');
    expect(ruleKey({ kind: 'feature', mode: 'avoid', featureId: 3 })).toBe('feature:avoid:3');
  });
});

describe('floorFacts', () => {
  it('reads the floor text in several languages', () => {
    expect(floorFacts('0', [], [])).toEqual({ ground: true, top: null });
    expect(floorFacts('Planta baja', [], [])).toEqual({ ground: true, top: null });
    expect(floorFacts('bajo', [], [])).toEqual({ ground: true, top: null });
    expect(floorFacts('Ground floor', [], [])).toEqual({ ground: true, top: null });
    expect(floorFacts('3rd', [], [])).toEqual({ ground: false, top: null });
    expect(floorFacts('2', [], [])).toEqual({ ground: false, top: null });
    expect(floorFacts('Ático', [], [])).toEqual({ ground: false, top: true });
    expect(floorFacts('Penthouse', [], [])).toEqual({ ground: false, top: true });
  });

  it('falls back to the property type name, then the features', () => {
    expect(floorFacts(null, ['Ground Floor Apartment'], [])).toEqual({ ground: true, top: false });
    expect(floorFacts('', ['Middle Floor Apartment'], [])).toEqual({ ground: false, top: false });
    expect(floorFacts(null, ['Penthouse', 'Ático'], [])).toEqual({ ground: false, top: true });
    expect(floorFacts(null, ['Apartment'], ['Sea Views', 'Top floor'])).toEqual({ ground: false, top: true });
    expect(floorFacts(null, ['Villa'], [])).toEqual({ ground: false, top: null });
  });

  it('the floor text wins over the type name; nothing known = null', () => {
    expect(floorFacts('1', ['Ground Floor Apartment'], [])).toEqual({ ground: false, top: false });
    expect(floorFacts(null, ['Apartment'], ['Lift'])).toEqual({ ground: null, top: null });
    expect(floorFacts('n/a', [], [])).toEqual({ ground: null, top: null });
  });
});

const r = (rule: Omit<NoteRule, 'id' | 'text' | 'strength'> & Partial<NoteRule>): NoteRule =>
  ({ text: 'w', strength: 'hard', ...rule, id: ruleKey(rule as NoteRule) }) as NoteRule;

const facts = (over: Partial<RuleFacts> = {}): RuleFacts => ({
  floor: { ground: null, top: null },
  features: [1, 3],
  propertyTypeId: 2,
  locationId: 11,
  numbers: { price: { low: 400000, high: 400000 }, bedrooms: { low: 2, high: 2 }, builtYear: null },
  within: { places: new Map([[10, new Set([10, 11])]]), types: new Map([[2, new Set([2, 3])]]) },
  ...over,
});

describe('checkRules', () => {
  it('floor rules: broken, kept, or unknown', () => {
    const avoidGround = r({ kind: 'floor', mode: 'avoid', value: 'ground' });
    const wantTop = r({ kind: 'floor', mode: 'require', value: 'top' });
    expect(checkRules([avoidGround, wantTop], facts({ floor: { ground: true, top: false } }))).toEqual({ broken: [avoidGround, wantTop], unknown: [] });
    expect(checkRules([avoidGround, wantTop], facts({ floor: { ground: false, top: true } }))).toEqual({ broken: [], unknown: [] });
    expect(checkRules([avoidGround, wantTop], facts())).toEqual({ broken: [], unknown: [avoidGround, wantTop] });
  });

  it('feature rules; a listing without feature data is unknown', () => {
    const noPool = r({ kind: 'feature', mode: 'avoid', featureId: 3 });
    const seaViews = r({ kind: 'feature', mode: 'require', featureId: 12 });
    expect(checkRules([noPool, seaViews], facts()).broken).toEqual([noPool, seaViews]);
    expect(checkRules([noPool, seaViews], facts({ features: [12] })).broken).toEqual([]);
    expect(checkRules([noPool, seaViews], facts({ features: null })).unknown).toEqual([noPool, seaViews]);
  });

  it('type and place rules include everything below them', () => {
    const noApartments = r({ kind: 'type', mode: 'avoid', propertyTypeId: 2 });
    const notSanPedro = r({ kind: 'place', mode: 'avoid', locationId: 10 });
    expect(checkRules([noApartments, notSanPedro], facts({ propertyTypeId: 3 })).broken).toEqual([noApartments, notSanPedro]);
    expect(checkRules([noApartments, notSanPedro], facts({ propertyTypeId: 1, locationId: 12 })).broken).toEqual([]);
    expect(checkRules([notSanPedro], facts({ locationId: null })).unknown).toEqual([notSanPedro]);
    // Not expanded (map has no entry): plain equality.
    expect(checkRules([r({ kind: 'type', mode: 'avoid', propertyTypeId: 1 })], facts({ propertyTypeId: 1 })).broken).toHaveLength(1);
  });

  it('number rules use the cheapest / biggest end of a range', () => {
    const maxPrice = r({ kind: 'max', field: 'price', value: 450000 });
    const minBeds = r({ kind: 'min', field: 'bedrooms', value: 3 });
    const newish = r({ kind: 'min', field: 'builtYear', value: 2010 });
    expect(checkRules([maxPrice, minBeds, newish], facts())).toEqual({ broken: [minBeds], unknown: [newish] });
    const dev = facts({ numbers: { price: { low: 420000, high: 900000 }, bedrooms: { low: 1, high: 3 } } });
    expect(checkRules([maxPrice, minBeds], dev).broken).toEqual([]);
    expect(checkRules([maxPrice], facts({ numbers: { price: { low: 500000, high: 500000 } } })).broken).toEqual([maxPrice]);
  });
});

describe('rulePenalty / rulesHash', () => {
  it('hard −40, soft −15, never below 0', () => {
    const hard = r({ kind: 'floor', mode: 'avoid', value: 'ground' });
    const soft = r({ kind: 'max', field: 'price', value: 1, strength: 'soft' });
    expect(rulePenalty(100, [hard])).toBe(60);
    expect(rulePenalty(100, [soft])).toBe(85);
    expect(rulePenalty(30, [hard, soft])).toBe(0);
    expect(rulePenalty(70, [])).toBe(70);
  });

  it('the same notes give the same hash, whatever the line ends', () => {
    expect(rulesHash('a\r\nb ')).toBe(rulesHash('a\nb'));
    expect(rulesHash('a')).not.toBe(rulesHash('b'));
    expect(rulesHash(null)).toBe(rulesHash(''));
    expect(rulesHash('x')).toMatch(/^[a-f0-9]{64}$/);
  });
});
