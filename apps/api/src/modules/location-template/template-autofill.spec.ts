import {
  anchorOf,
  AiQuestion,
  cleanPostcode,
  FillNode,
  pickHit,
  postcodeProblem,
  provincePrefixes,
  queriesFor,
  readFillAnswers,
} from './template-autofill';

const node = (id: number, parentId: number | null, level: string, name: string, extra: Partial<FillNode> = {}): FillNode => ({
  id,
  parentId,
  level,
  name,
  lat: null,
  lng: null,
  postcode: null,
  ...extra,
});

const tree = [
  node(1, null, 'region', 'Andalucía'),
  node(2, 1, 'province', 'Málaga', { lat: 36.72, lng: -4.42 }),
  node(3, 2, 'area', 'Costa del Sol West'),
  node(4, 3, 'municipality', 'Marbella', { lat: 36.5101, lng: -4.8824, postcode: '29601' }),
  node(5, 4, 'town', 'El Rosario'),
  node(6, 2, 'municipality', 'Estepona', { postcode: '29680' }),
];
const byId = new Map(tree.map((n) => [n.id, n]));

describe('template auto-fill', () => {
  it('asks the map with municipality and province, never the area', () => {
    expect(queriesFor(byId.get(5)!, byId)).toEqual(['El Rosario, Marbella, Málaga, Spain', 'El Rosario, Málaga, Spain']);
  });

  it('checks a new point against the nearest ancestor that has one', () => {
    expect(anchorOf(byId.get(5)!, byId)).toMatchObject({ name: 'Marbella', level: 'municipality' });
  });

  it('takes the first map result near the parent and skips a namesake far away', () => {
    const anchor = anchorOf(byId.get(5)!, byId);
    const pick = pickHit(
      [
        { lat: '28.46', lon: '-16.25', address: { postcode: '38290' } }, // El Rosario, Tenerife
        { lat: '36.4920', lon: '-4.8100', address: { postcode: '29604' } },
      ],
      anchor,
    );
    expect(pick).toEqual({ lat: 36.492, lng: -4.81, postcode: '29604' });
  });

  it('reports why nothing was usable', () => {
    const pick = pickHit([{ lat: '28.46', lon: '-16.25' }], anchorOf(byId.get(5)!, byId));
    expect('problem' in pick && pick.problem).toMatch(/km from Marbella/);
    expect(pickHit([], null)).toEqual({ problem: 'not found on the map' });
  });

  it('keeps one five-digit postcode', () => {
    expect(cleanPostcode('29600;29610')).toBe('29600');
    expect(cleanPostcode('2960')).toBeNull();
    expect(cleanPostcode(undefined)).toBeNull();
  });

  it('refuses a postcode from another province', () => {
    const prefixes = provincePrefixes(tree, byId);
    expect(prefixes.get(2)).toBe('29');
    expect(postcodeProblem('29604', '29')).toBeNull();
    expect(postcodeProblem('03001', '29')).toMatch(/not in this province/);
    expect(postcodeProblem('03001', null)).toBeNull();
  });

  it('reads only the values that were asked for', () => {
    const qs: AiQuestion[] = [
      { node: byId.get(5)!, path: 'x', needCoords: true, needPostcode: false },
      { node: byId.get(6)!, path: 'y', needCoords: true, needPostcode: true },
    ];
    const answers = readFillAnswers(qs, {
      '1': { lat: 36.49, lng: -4.81, postcode: '29604' },
      '2': null,
    });
    expect(answers.get(5)).toEqual({ lat: 36.49, lng: -4.81, postcode: null });
    expect(answers.has(6)).toBe(false);
  });
});
