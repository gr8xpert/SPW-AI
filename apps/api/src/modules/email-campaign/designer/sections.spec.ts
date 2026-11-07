import { renderCampaignEmail, readableOn, softTint } from '../campaign-render';
import { checkTemplate, inlineCss } from '../template-check';
import { LAYOUTS } from './layouts';
import { readDirections } from './design-directions.service';
import { runDesignerTool, type DesignState } from './designer-tools';
import { composeDesign, SECTION_NAMES, THEME_NAMES, validSections } from './sections';

const card = (i: number) => ({ title: `Villa ${i}`, location: 'Marbella', propertyType: 'Villa', price: `€${i},000,000`, facts: ['3 bed', '200 m²'], image: `https://img/${i}.jpg`, url: `https://site/p/${i}`, reference: `R${i}`, beds: 3, baths: 2, area: '200 m²' });
const render = (bodyHtml: string, count: number, logo: string | null = 'https://cdn/logo.png') => renderCampaignEmail({
  subject: 's', bodyHtml: inlineCss(checkTemplate(bodyHtml).html), contact: { name: 'Ann Smith', email: 'a@x.es' }, agency: 'Sun Homes', color: '#0055aa',
  agencyInfo: { logo, phone: '+34 1', email: 'i@s.es', website: 'https://sun.es' },
  properties: Array.from({ length: count }, (_, i) => card(i + 1)), unsubscribeUrl: 'https://api/u',
});

describe('email sections', () => {
  it.each(THEME_NAMES.map((t) => [t]))('every section is clean in the %s theme', (theme) => {
    const noClash = SECTION_NAMES.filter((s) => !/-all$/.test(s));
    const check = checkTemplate(composeDesign({ theme, sections: noClash, copy: { imageUrl: 'https://cdn/banner.jpg' } }));
    expect(check.errors).toEqual([]);
    expect(check.warnings).toEqual([]);
    const out = render(composeDesign({ theme, sections: noClash, copy: { imageUrl: 'https://cdn/banner.jpg' } }), 3);
    expect(out.html).not.toMatch(/\{\{/);
    expect(out.html).toContain('https://cdn/banner.jpg');
  });

  it('always ends with the footer, once', () => {
    const html = composeDesign({ theme: 'classic', sections: ['footer', 'hero-text'] });
    expect(html.split('{{unsubscribe_link}}').length - 1).toBe(1);
    expect(html.indexOf('{{unsubscribe_link}}')).toBeGreaterThan(html.indexOf('<h1'));
  });

  it('escapes words from the AI but keeps placeholders', () => {
    const html = composeDesign({ theme: 'classic', sections: ['hero-text'], copy: { headline: '<script>x</script> {{contact.first_name}}', ctaUrl: 'javascript:alert(1)' } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('{{contact.first_name}}');
    const cta = composeDesign({ theme: 'classic', sections: ['cta-center'], copy: { ctaUrl: 'javascript:alert(1)' } });
    expect(cta).not.toContain('javascript:');
  });

  it('refuses sections that would show listings twice', () => {
    expect(validSections(['grid-all', 'lead-feature']).problem).toBeTruthy();
    expect(validSections(['grid-all', 'rows-all']).problem).toBeTruthy();
    expect(validSections(['nope']).problem).toMatch(/unknown/);
    expect(validSections(['hero-photo', 'lead-details', 'grid-others']).sections).toHaveLength(3);
  });
});

describe('lead and other listings', () => {
  const html = composeDesign({ theme: 'bright', sections: ['lead-feature', 'grid-others'], copy: { moreTitle: 'More homes' } });

  it('shows the first big and the rest after it', () => {
    const out = render(html, 3).html;
    expect(out.split('https://site/p/1').length - 1).toBeGreaterThan(0);
    expect(out.indexOf('https://site/p/1')).toBeLessThan(out.indexOf('More homes'));
    expect(out.indexOf('More homes')).toBeLessThan(out.indexOf('https://site/p/2'));
    expect(out.indexOf('More homes')).toBeLessThan(out.indexOf('https://site/p/3'));
  });

  it('hides the "more" heading with one listing and everything with none', () => {
    const one = render(html, 1).html;
    expect(one).toContain('https://site/p/1');
    expect(one).not.toContain('More homes');
    const none = render(html, 0).html;
    expect(none).not.toContain('Villa');
    expect(none).not.toMatch(/\{\{/);
  });

  it('keeps table structure through css inlining', () => {
    const inlined = inlineCss(html);
    expect(inlined).toContain('{{#lead_property}}');
    expect(inlined).toContain('{{/other_properties}}');
    expect(inlined).toContain('{{#has_other_properties}}');
  });

  it('flags an unclosed block', () => {
    expect(checkTemplate('{{#lead_property}}<p>x</p>').errors).toContain('LOOP_UNBALANCED');
    expect(checkTemplate('{{#has_other_properties}}<p>x</p>').errors).toContain('LOOP_UNBALANCED');
    expect(checkTemplate('{{#lead_property}}{{#properties}}x{{/properties}}{{/lead_property}}').errors).toContain('LOOP_UNBALANCED');
    expect(checkTemplate('{{#properties}}{{property.facts}}{{/properties}}{{unsubscribe_link}}').errors).toEqual([]);
  });

  it('leaves no marker in the plain text version', () => {
    expect(render(html, 3).text).not.toMatch(/\{\{|\}\}/);
    expect(render(html, 1).text).not.toContain('More homes');
  });
});

describe('logo', () => {
  it.each(LAYOUTS.map((l) => [l.name, l.html]))('%s shows the agency name when no logo is set', (_n, source) => {
    const out = render(source, 3, null).html;
    expect(out).not.toMatch(/<img[^>]*alt="Sun Homes"/);
    expect(out).toMatch(/<span style="[^"]*font-weight:bold[^"]*">Sun Homes<\/span>/);
  });

  it('shows the logo when set', () => {
    const out = render(LAYOUTS[0].html, 3).html;
    expect(out).toContain('src="https://cdn/logo.png"');
  });

  it('puts the logo on a white plate on dark and brand blocks, not on light ones', () => {
    const plate = /<img[^>]*style="[^"]*background: ?#ffffff[^"]*"[^>]*cdn\/logo|<img[^>]*cdn\/logo[^>]*style="[^"]*background: ?#ffffff/;
    expect(render(composeDesign({ theme: 'midnight', sections: ['logo-center'] }), 0).html).toMatch(plate);
    expect(render(composeDesign({ theme: 'classic', sections: ['logo-brand'] }), 0).html).toMatch(plate);
    expect(render(composeDesign({ theme: 'classic', sections: ['logo-center'] }), 0).html).not.toMatch(plate);
  });

  it('has no plate around the agency name', () => {
    const out = render(composeDesign({ theme: 'midnight', sections: ['logo-center'] }), 0, null).html;
    expect(out).toMatch(/<span style="[^"]*">Sun Homes/);
    expect(out).not.toMatch(/<span style="[^"]*background[^"]*">Sun Homes/);
  });

  it('does not print the facts twice under the lead photo', () => {
    const out = render(composeDesign({ theme: 'classic', sections: ['hero-photo', 'lead-details'] }), 1).html;
    expect(out.split('3 bed').length - 1).toBe(1);
  });

  it('colours the name for the block it sits on', () => {
    const out = render(composeDesign({ theme: 'classic', sections: ['logo-brand'] }), 0, null).html;
    expect(out).toMatch(/<span style="[^"]*color:#ffffff[^"]*">Sun Homes/);
  });

  it('works with single quotes and an image the AI wrote', () => {
    const out = render("<table><tr><td><img src='{{agency.logo}}' alt='x' width='120'></td></tr></table><a href='{{unsubscribe_link}}'>u</a>", 0, null).html;
    expect(out).toContain('Sun Homes');
    expect(out).not.toContain('<img');
  });
});

describe('brand colour helpers', () => {
  it('picks readable text', () => {
    expect(readableOn('#ffffff')).toBe('#111111');
    expect(readableOn('#f4d03f')).toBe('#111111');
    expect(readableOn('#0b2545')).toBe('#ffffff');
  });
  it('tints towards white', () => {
    expect(softTint('#000000')).toBe('#e6e6e6');
    expect(softTint('#ffffff')).toBe('#ffffff');
  });
});

describe('compose_design tool', () => {
  const state = (): DesignState => ({ html: '', subject: '', notes: [], changed: false });

  it('builds a design and returns it for later edits', () => {
    const s = state();
    const res = runDesignerTool(s, 'compose_design', JSON.stringify({ theme: 'midnight', sections: ['logo-center', 'hero-photo', 'lead-details', 'grid-others'], copy: { moreTitle: 'Más' }, lang: 'es' }));
    expect(res).toMatch(/^OK/);
    expect(res).toContain('Más');
    expect(s.changed).toBe(true);
    expect(s.layoutApplied).toBe(false);
    expect(s.html).toContain('lang="es"');
  });

  it('explains bad input without changing the design', () => {
    const s = state();
    expect(runDesignerTool(s, 'compose_design', JSON.stringify({ theme: 'x', sections: ['footer'] }))).toMatch(/unknown theme/);
    expect(runDesignerTool(s, 'compose_design', JSON.stringify({ theme: 'classic', sections: ['grid-all', 'lead-feature'] }))).toMatch(/^ERROR/);
    expect(s.changed).toBe(false);
  });
});

describe('design directions', () => {
  it('keeps what is usable', () => {
    const list = readDirections(JSON.stringify({ directions: [
      { label: 'Photo first', why: 'Big picture', subject: 'New\nhomes', theme: 'bright', sections: ['logo-center', 'hero-photo', 'lead-details'], copy: {} },
      { label: 'Bad', theme: 'nope', sections: ['footer'], subject: 'x', copy: {} },
      { label: 'Clash', theme: 'classic', sections: ['grid-all', 'lead-feature'], subject: 'x', copy: {} },
    ] }), 'en');
    expect(list).toHaveLength(1);
    expect(list[0].subject).toBe('New homes');
    expect(list[0].html).toContain('{{#lead_property}}');
  });

  it('survives junk', () => {
    expect(readDirections('not json', 'en')).toEqual([]);
    expect(readDirections('{}', 'en')).toEqual([]);
  });
});
