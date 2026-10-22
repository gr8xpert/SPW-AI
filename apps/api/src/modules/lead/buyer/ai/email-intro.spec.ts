import { cleanIntro, introMessage, introPrompt, type IntroInput } from './email-intro';

const input: IntroInput = {
  firstName: 'Joaquin',
  wishlist: 'Resale · Golden Mile · up to €400,000',
  rules: ['top floor only'],
  properties: [
    { ref: 'R1', title: 'Apartment in Marbella', town: 'Marbella', type: 'Apartment', price: '€380,000', beds: 2, meets: ['Sea Views'] },
    { ref: 'R2', title: 'Penthouse', town: 'Marbella', type: 'Penthouse', price: '€399,000', beds: 2, meets: ['top floor'] },
  ],
};

describe('introPrompt', () => {
  it('names the task and the language, asks for plain short text', () => {
    const p = introPrompt('es');
    expect(p.startsWith('TASK: intro\n')).toBe(true);
    expect(p).toContain('LANGUAGE: es');
    expect(p).toMatch(/90 words/);
    expect(p).toContain('"text"');
  });

  it('a bad language code falls back to English', () => {
    expect(introPrompt('../x')).toContain('LANGUAGE: en');
  });
});

describe('introMessage', () => {
  it('only first name, wishlist words, rules and the properties', () => {
    const m = introMessage(input);
    expect(m).toContain('BUYER FIRST NAME: Joaquin');
    expect(m).toContain('1. R1 · Apartment in Marbella · Marbella · Apartment · €380,000 · 2 bed · meets: Sea Views');
    expect(m).toContain('top floor only');
    expect(m).not.toMatch(/@/);
  });

  it('caps the number of properties and the size', () => {
    const many = { ...input, properties: Array.from({ length: 40 }, (_, i) => ({ ...input.properties[0], ref: `R${i}`, title: 't'.repeat(300) })) };
    const m = introMessage(many);
    expect(m).toContain('10. R9');
    expect(m).not.toContain('11. R10');
    expect(m.length).toBeLessThanOrEqual(3500);
  });

  it('no first name → says so', () => {
    expect(introMessage({ ...input, firstName: null })).toContain('BUYER FIRST NAME: (unknown)');
  });
});

describe('cleanIntro', () => {
  it('plain text, no markup or links, trimmed', () => {
    expect(cleanIntro({ text: '  <p>Hola Joaquín,</p> mire https://evil.example/x y www.x.com ahora  ' })).toBe('Hola Joaquín, mire y ahora');
  });

  it('keeps paragraphs, caps length', () => {
    expect(cleanIntro({ text: 'A.\n\n\n\nB.' })).toBe('A.\n\nB.');
    expect(cleanIntro({ text: 'x '.repeat(1000) })!.length).toBeLessThanOrEqual(900);
  });

  it('null when empty or not text', () => {
    expect(cleanIntro({ text: '   ' })).toBeNull();
    expect(cleanIntro({ text: 5 })).toBeNull();
    expect(cleanIntro({})).toBeNull();
  });
});
