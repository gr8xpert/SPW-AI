import { DEFAULT_QUESTIONS, answersFromForm, cleanAnswers, questionKey } from './buyer-question-defaults';

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

describe('answersFromForm', () => {
  type Q = Parameters<typeof answersFromForm>[0][number];
  const QS: Q[] = [
    {
      qkey: 'timeframe',
      multiple: false,
      label: { en: 'When do you want to buy?', nl: 'Wanneer wil je kopen?' },
      options: [
        { key: 'now', label: { en: 'As soon as possible', nl: 'Zo snel mogelijk' } },
        { key: '3_months', label: { en: 'Within 3 months', nl: 'Binnen 3 maanden' } },
      ],
    },
    {
      qkey: 'hoe_ver_ben_jij',
      multiple: false,
      label: { nl: 'Hoe ver ben jij al in je zoektocht' },
      options: [{ key: 'orienteren', label: { nl: 'Ik ben me aan het oriënteren' } }],
    },
    {
      qkey: 'location_setting',
      multiple: true,
      label: { en: 'Location setting' },
      options: [{ key: 'coast', label: { en: 'Coast' } }, { key: 'village', label: { en: 'Village' } }],
    },
    { qkey: 'off', multiple: false, isActive: false, label: { en: 'Off' }, options: [{ key: 'x', label: { en: 'X' } }] },
  ];

  it('matches questions and options by label in any language, as Facebook writes them', () => {
    expect(
      answersFromForm(
        QS,
        [
          { question: 'Wanneer wil je kopen?', answer: 'binnen_3_maanden' },
          { question: 'Hoe ver ben jij al in je zoektocht naar een extra woning in Spanje?', answer: 'Ik ben me aan het oriënteren' },
          { question: 'Location setting', answer: 'coast, village, moon' },
          { question: 'Budget', answer: '300k' },
          { question: 'Off', answer: 'X' },
        ],
        null,
      ),
    ).toEqual({ timeframe: ['3_months'], hoe_ver_ben_jij: ['orienteren'], location_setting: ['coast', 'village'] });
  });

  it("never overwrites an answer the buyer already has, and skips answers that aren't an option", () => {
    expect(answersFromForm(QS, [{ question: 'When do you want to buy?', answer: 'As soon as possible' }], { timeframe: ['3_months'] })).toEqual({});
    expect(answersFromForm(QS, [{ question: 'When do you want to buy?', answer: 'next summer' }], null)).toEqual({});
  });
});
