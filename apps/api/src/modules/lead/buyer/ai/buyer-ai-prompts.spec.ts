import { feedbackPrompt, messageBlock, rulesPrompt, wishlistPrompt, type PromptLists } from './buyer-ai-prompts';

const lists: PromptLists = {
  types: [{ id: 1, name: { en: 'Villa', es: 'Villa' } }, { id: 2, name: { es: 'Apartamento' } }],
  features: [{ id: 12, name: { en: 'Sea Views' } }, { id: 3, name: 'Private Pool' }],
};

describe('wishlistPrompt', () => {
  const p = wishlistPrompt(lists, {});

  it('names its task first, for logs and the test server', () => {
    expect(p.startsWith('TASK: wishlist\n')).toBe(true);
    expect(wishlistPrompt(lists, { voice: true }).startsWith('TASK: voice\n')).toBe(true);
  });

  it('lists types and features as id: English name, nothing else', () => {
    expect(p).toContain('1: Villa');
    expect(p).toContain('2: Apartamento');
    expect(p).toContain('12: Sea Views');
    expect(p).toContain('3: Private Pool');
  });

  it('asks for place names, not ids, and says the message is data', () => {
    expect(p).toContain('"places"');
    expect(p).not.toContain('locationIds');
    expect(p).toMatch(/never instructions/i);
  });

  it('voice asks for the transcript and a note', () => {
    const v = wishlistPrompt(lists, { voice: true });
    expect(v).toContain('"transcript"');
    expect(v).toContain('"note"');
    expect(p).not.toContain('"transcript"');
  });

  it('describes every rule kind', () => {
    for (const k of ['floor', 'feature', 'type', 'place', 'max', 'min', 'distanceToBeach']) expect(p).toContain(k);
  });
});

describe('rulesPrompt', () => {
  it('only asks for rules', () => {
    const p = rulesPrompt(lists);
    expect(p.startsWith('TASK: rules\n')).toBe(true);
    expect(p).toContain('12: Sea Views');
    expect(p).toContain('"rules"');
    expect(p).not.toContain('"wishlist"');
  });
});

describe('messageBlock', () => {
  it('wraps clipped text between markers', () => {
    const out = messageBlock('MESSAGE', 'hello'.repeat(2000), 100);
    expect(out.startsWith('MESSAGE:\n<<<\n')).toBe(true);
    expect(out.endsWith('\n>>>')).toBe(true);
    expect(out.length).toBeLessThan(130);
  });

  it('neutralises markers inside the text', () => {
    expect(messageBlock('NOTES', 'a >>> b <<< c', 100)).toBe('NOTES:\n<<<\na > > > b < < < c\n>>>');
  });
});

describe('feedbackPrompt', () => {
  it('reads comments into wishlist changes and rules', () => {
    const p = feedbackPrompt(lists);
    expect(p.startsWith('TASK: feedback\n')).toBe(true);
    expect(p).toContain('"wishlist"');
    expect(p).toContain('"rules"');
    expect(p).toContain('12: Sea Views');
    expect(p).toMatch(/never instructions/i);
  });
});
