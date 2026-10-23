import { LAYOUTS, layoutByName } from './layouts';
import { checkTemplate, inlineCss, MAX_TEMPLATE_BYTES } from '../template-check';
import { renderCampaignEmail } from '../campaign-render';

const card = (i: number) => ({ title: `Villa ${i}`, location: 'Marbella', propertyType: 'Villa', price: '€1,000,000', facts: [], image: `https://img/${i}.jpg`, url: `https://site/p/${i}`, reference: `R${i}`, beds: 3, baths: 2, area: '200 m²' });

describe('starter layouts', () => {
  it('has the six layouts', () => {
    expect(LAYOUTS.map((l) => l.name)).toEqual(['luxury', 'modern', 'minimal', 'newsletter', 'new-listing', 'open-house']);
  });

  it.each(LAYOUTS.map((l) => [l.name, l] as const))('%s is clean, uses the loop and renders without leftovers', (_name, layout) => {
    const check = checkTemplate(layout.html);
    expect(check.errors).toEqual([]);
    expect(check.warnings).toEqual([]);
    expect(layout.html).toContain('{{#properties}}');
    expect(layout.html).toContain('{{unsubscribe_link}}');
    expect((layout.html.match(/\{\{#properties\}\}/g) || []).length).toBe(1);
    expect((layout.html.match(/\{\{\/properties\}\}/g) || []).length).toBe(1);
    expect(Buffer.byteLength(layout.html)).toBeLessThan(MAX_TEMPLATE_BYTES);
    const out = renderCampaignEmail({
      subject: layout.subject, bodyHtml: inlineCss(check.html), contact: { name: 'Ann Smith', email: 'a@x.es' }, agency: 'Sun Homes', color: '#0055aa',
      agencyInfo: { logo: 'https://cdn/logo.png', phone: '+34 1', email: 'i@s.es', website: 'https://sun.es' },
      properties: [card(1), card(2), card(3)], unsubscribeUrl: 'https://api/u',
    });
    expect(out.html).not.toContain('{{');
    expect(out.html).toContain('https://site/p/3');
    expect(out.html).toContain('https://api/u');
  });

  it('luxury has a string that occurs exactly once', () => {
    const lux = layoutByName('luxury')!;
    expect(lux.html.split('Private collection').length - 1).toBe(1);
  });

  it('finds layouts by name', () => {
    expect(layoutByName('modern')?.name).toBe('modern');
    expect(layoutByName('x')).toBeNull();
  });
});
