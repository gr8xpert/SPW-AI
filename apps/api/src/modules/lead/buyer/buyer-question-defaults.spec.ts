import { DEFAULT_QUESTIONS, cleanAnswers, questionKey } from './buyer-question-defaults';

const Q = [
  { qkey: 'purpose', multiple: false, options: [{ key: 'investment' }, { key: 'holiday_home' }] },
  { qkey: 'location_setting', multiple: true, options: [{ key: 'village' }, { key: 'coast' }, { key: 'countryside' }] },
];

describe('buyer question defaults', () => {
  it('seeds 8 questions with unique keys and en + es labels', () => {
    expect(DEFAULT_QUESTIONS).toHaveLength(8);
    expect(new Set(DEFAULT_QUESTIONS.map((q) => q.qkey)).size).toBe(8);
    for (const q of DEFAULT_QUESTIONS) {
      expect(q.label.en && q.label.es).toBeTruthy();
      expect(q.options.length).toBeGreaterThan(1);
      expect(new Set(q.options.map((o) => o.key)).size).toBe(q.options.length);
      for (const o of q.options) expect(o.label.en && o.label.es).toBeTruthy();
    }
    expect(DEFAULT_QUESTIONS.find((q) => q.qkey === 'location_setting')?.multiple).toBe(true);
    expect(DEFAULT_QUESTIONS.map((q) => q.qkey)).toEqual(expect.arrayContaining(['timeframe', 'found_us']));
  });

  it('makes a stable key from a label', () => {
    expect(questionKey('Distance to beach')).toBe('distance_to_beach');
    expect(questionKey('  ¿Cómo nos encontró?  ')).toBe('como_nos_encontro');
    expect(questionKey('Price / m²')).toBe('price_m');
    expect(questionKey('!!!')).toBe('');
    expect(questionKey('a'.repeat(80))).toHaveLength(60);
  });

  it('keeps only known questions and options', () => {
    expect(
      cleanAnswers(Q, { purpose: ['investment'], unknown: ['x'], location_setting: ['coast', 'moon', 'village'] }),
    ).toEqual({ purpose: ['investment'], location_setting: ['coast', 'village'] });
  });

  it('keeps one option for a single-choice question and drops empties and duplicates', () => {
    expect(cleanAnswers(Q, { purpose: ['holiday_home', 'investment'] })).toEqual({ purpose: ['holiday_home'] });
    expect(cleanAnswers(Q, { purpose: [], location_setting: ['coast', 'coast'] })).toEqual({ location_setting: ['coast'] });
    expect(cleanAnswers(Q, { purpose: 'investment' as never })).toEqual({ purpose: ['investment'] });
    expect(cleanAnswers(Q, null)).toEqual({});
  });
});
