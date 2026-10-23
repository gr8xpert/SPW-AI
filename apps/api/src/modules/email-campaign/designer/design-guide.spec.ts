import { designerSystemPrompt } from './design-guide';

describe('designerSystemPrompt', () => {
  const base = { agency: 'Sun Homes', color: '#0055aa', hasLogo: true, phone: '+34 1', email: 'i@s.es', website: 'https://sun.es', notes: ['No emojis'], language: 'es', currentHtml: '<p>x</p>', currentSubject: 'Hi' };
  it('carries the rules, the brand notes, the language and the current design', () => {
    const p = designerSystemPrompt(base);
    expect(p).toContain('600');
    expect(p).toContain('{{#properties}}');
    expect(p).toContain('No emojis');
    expect(p).toContain('Spanish');
    expect(p).toContain('<p>x</p>');
    expect(p).toContain('luxury');
  });
  it('tells the model about invented facts, dark mode and removed data: images', () => {
    const p = designerSystemPrompt(base);
    expect(p).toMatch(/never invent/i);
    expect(p).toMatch(/dark.mode/i);
    expect(p).toMatch(/data: image/i);
  });
  it('says there is no design yet for an empty template', () => {
    expect(designerSystemPrompt({ ...base, currentHtml: '' })).toContain('no design yet');
  });
});
