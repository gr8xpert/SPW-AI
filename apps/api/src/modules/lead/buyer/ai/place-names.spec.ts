import { resolvePlaces, type NamedPlace } from './place-names';

const places: NamedPlace[] = [
  { id: 1, name: { en: 'Marbella', es: 'Marbella' }, level: 'town' },
  { id: 2, name: { en: 'Marbella' }, level: 'area' },
  { id: 3, name: { en: 'Nueva Andalucía' }, level: 'urbanization' },
  { id: 4, name: { en: 'The Golden Mile', es: 'Milla de Oro' }, level: 'urbanization' },
  { id: 5, name: { en: 'San Pedro de Alcántara' }, aliases: ['San Pedro'], level: 'town' },
  { id: 6, name: { en: 'Estepona' }, level: 'town' },
  { id: 7, name: { en: 'Benahavís' }, level: 'town' },
  { id: 8, name: 'Sierra Blanca', level: 'urbanization' },
];

const ids = (names: unknown) => resolvePlaces(names, places).map((p) => p.id);

describe('resolvePlaces', () => {
  it('matches names in any language and spelling, preferring the town', () => {
    expect(ids(['marbella', 'Nueva Andalucia', 'Milla de Oro', 'BENAHAVIS'])).toEqual([1, 3, 4, 7]);
  });

  it('uses aliases and drops a leading article', () => {
    expect(ids(['San Pedro', 'Golden Mile', 'the golden mile'])).toEqual([5, 4]);
  });

  it('accepts a unique partial name', () => {
    expect(ids(['Alcantara'])).toEqual([5]);
  });

  it('forgives small typos in longer names', () => {
    expect(ids(['Esteponna', 'Benahavies'])).toEqual([6, 7]);
  });

  it('leaves unknown, ambiguous or too-short names unresolved, keeping the words', () => {
    const out = resolvePlaces(['Atlantis', 'a', 'Sierra'], places);
    expect(out.map((p) => [p.name, p.id])).toEqual([['Atlantis', null], ['Sierra', 8]]);
    expect(resolvePlaces(['Mar'], places)[0].id).toBeNull();
  });

  it('gives an English label for found places', () => {
    expect(resolvePlaces(['milla de oro'], places)[0]).toEqual({ name: 'milla de oro', id: 4, label: 'The Golden Mile' });
  });

  it('ignores anything but strings, and caps the list', () => {
    expect(resolvePlaces('Marbella', places)).toEqual([]);
    expect(resolvePlaces([1, null, { a: 1 }, 'Estepona'], places).map((p) => p.id)).toEqual([6]);
    expect(resolvePlaces(Array.from({ length: 30 }, (_, i) => `Place ${i}`), places)).toHaveLength(10);
  });
});
