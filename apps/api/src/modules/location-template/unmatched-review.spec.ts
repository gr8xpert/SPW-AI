import { LOCATION_TEMPLATE_SEED } from './seed/location-template.seed';
import { locationKey, LOCATION_LEVELS } from './location-name';
import { TemplateIndex, TemplateNodeLite } from './location-template.resolver';
import { autoApplicable, buildPrompt, buildQuestion, looseKey, nameSimilarity, readAnswers, ReviewEntry } from './unmatched-review';

// The real seed, so the names below are ones feeds actually send.
const nodes: TemplateNodeLite[] = LOCATION_TEMPLATE_SEED.map(([parent, level, name, , lat, lng, note], i) => ({
  id: i + 1,
  parentId: parent >= 0 ? parent + 1 : null,
  level: LOCATION_LEVELS[level],
  name,
  nameKey: locationKey(name),
  aliases: null,
  status: note ? 'needs_review' : 'ok',
  lat,
  lng,
}));
const index = new TemplateIndex(nodes);
const byName = (name: string, level: string) => nodes.find((n) => n.name === name && n.level === level)!;
const alicante = byName('Alicante', 'province');
const latzubiaTown = nodes.find((n) => n.name === "L'Atzúbia" && n.level === 'town')!;

const entry = (over: Partial<ReviewEntry> = {}): ReviewEntry => ({
  id: 1,
  name: 'ADSUBIA',
  subName: null,
  placedUnderNodeId: alicante.id,
  lat: null,
  lng: null,
  ...over,
});

describe('spelling match', () => {
  it("treats ADSUBIA, Atzúbia and L'Atzúbia as the same name", () => {
    expect(looseKey('ADSUBIA')).toBe(looseKey("L'Atzúbia"));
    expect(nameSimilarity('ADSUBIA', 'Atzúbia')).toBe(1);
  });

  it('keeps clearly different names apart', () => {
    expect(nameSimilarity('Benidorm', 'Benissa')).toBeLessThan(0.6);
  });
});

describe('buildQuestion', () => {
  it("offers L'Atzúbia for ADSUBIA sent under Alicante with no GPS", () => {
    const q = buildQuestion(index, entry())!;
    expect(q.places.map((c) => c.node.name)).toEqual(expect.arrayContaining(["L'Atzúbia", 'Atzúbia']));
    expect(q.municipalities.length).toBeGreaterThan(50);
    expect(q.municipalities.every((c) => c.node.level === 'municipality')).toBe(true);
  });

  it('with GPS, also offers the places nearest the listings', () => {
    const q = buildQuestion(index, entry({ name: 'Nowhere Known', lat: Number(latzubiaTown.lat), lng: Number(latzubiaTown.lng) }))!;
    expect(q.places.map((c) => c.node.id)).toContain(latzubiaTown.id);
    expect(q.municipalities.length).toBeLessThanOrEqual(25);
  });

  it('returns null when the feed reached no template place', () => {
    expect(buildQuestion(index, entry({ placedUnderNodeId: null }))).toBeNull();
  });

  it('the prompt lists each name with its own ids', () => {
    const prompt = buildPrompt(index, [buildQuestion(index, entry())!]);
    expect(prompt).toContain('"ADSUBIA"');
    expect(prompt).toMatch(/P\d+: L'Atzúbia \[town\]/);
  });
});

describe('readAnswers', () => {
  const q = buildQuestion(index, entry())!;
  const p = q.places.find((c) => c.node.id === latzubiaTown.id)!;

  it('turns a valid "same" answer into a proposal with the place path', () => {
    const r = readAnswers(index, [q], { 1: { action: 'same', id: p.label, reason: 'Valencian spelling' } }).get(1)!;
    expect(r).toMatchObject({ action: 'same', nodeId: latzubiaTown.id, km: null, flagged: false });
    expect(r.target).toContain("L'Atzúbia");
  });

  it('ignores an id it was not shown', () => {
    expect(readAnswers(index, [q], { 1: { action: 'same', id: 'P999' } }).get(1)!.action).toBeNull();
  });

  it('flags a place far from where the listings are', () => {
    const far = buildQuestion(index, entry({ lat: 36.51, lng: -4.88 }))!; // Marbella
    const hit = far.places.find((c) => c.node.id === latzubiaTown.id) ?? far.places[0];
    const r = readAnswers(index, [far], { 1: { action: 'same', id: hit.label } }).get(1)!;
    expect(r.flagged).toBe(true);
    expect(autoApplicable(r)).toBe(false);
  });

  it('records "dismiss" and "not sure"', () => {
    expect(readAnswers(index, [q], { 1: { action: 'dismiss', reason: 'not a place' } }).get(1)!.action).toBe('dismiss');
    expect(readAnswers(index, [q], { 1: null }).get(1)!.action).toBeNull();
  });
});

describe('autoApplicable', () => {
  it('applies a near "same" or an unflagged "new" by itself, never a dismiss or a "same" without GPS', () => {
    expect(autoApplicable({ action: 'same', km: 2, flagged: false, at: '' })).toBe(true);
    expect(autoApplicable({ action: 'same', km: null, flagged: false, at: '' })).toBe(false);
    expect(autoApplicable({ action: 'new', km: null, flagged: false, at: '' })).toBe(true);
    expect(autoApplicable({ action: 'new', km: 30, flagged: true, at: '' })).toBe(false);
    expect(autoApplicable({ action: 'dismiss', at: '' })).toBe(false);
  });
});
