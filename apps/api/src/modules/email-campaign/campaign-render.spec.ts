import { renderCampaignEmail, fillPlaceholders, LOOP_TEST_RE, type CampaignRenderInput } from './campaign-render';
import { checkTemplate, inlineCss } from './template-check';
import { LAYOUTS } from './designer/layouts';
import { verifyCampaignToken, campaignLinks } from './campaign-links';

const base = (over: Partial<CampaignRenderInput> = {}): CampaignRenderInput => ({
  subject: 'News for {{contact.first_name}}',
  bodyHtml: '<html><body><p>Hello {{contact.name}},</p>{{properties}}<p><a href="{{unsubscribe_link}}">Stop</a></p></body></html>',
  contact: { name: 'Ann <b>Smith</b>', email: 'ann@example.com' },
  agency: 'Sun Homes',
  properties: [],
  unsubscribeUrl: 'https://api.test/api/e/u/tok',
  pixelUrl: 'https://api.test/api/e/o/px',
  ...over,
});

describe('renderCampaignEmail', () => {
  it('escapes contact values in the body but not in the subject', () => {
    const out = renderCampaignEmail(base());
    expect(out.html).toContain('Hello Ann &lt;b&gt;Smith&lt;/b&gt;,');
    expect(out.subject).toBe('News for Ann');
  });

  it('puts the pixel before </body> and keeps the template unsubscribe link', () => {
    const out = renderCampaignEmail(base());
    expect(out.html).toMatch(/api\/e\/o\/px[^<]*<\/body>/);
    expect(out.html).toContain('href="https://api.test/api/e/u/tok"');
    expect(out.html).not.toContain("Don't want these emails");
  });

  it('adds an unsubscribe footer and the cards when the template has no slot for them', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '<p>Hi</p>',
      properties: [{ title: 'Villa <Sol>', location: 'Marbella', propertyType: 'Villa', price: '€500,000', facts: ['3 bed'], image: 'https://img/x.jpg', url: 'https://site/p/1' }],
    }));
    expect(out.html).toContain('Villa &lt;Sol&gt;');
    expect(out.html).toContain('href="https://site/p/1"');
    expect(out.html).toContain('href="https://api.test/api/e/u/tok"');
    expect(out.text).toContain('https://api.test/api/e/u/tok');
    expect(out.text).toContain('Villa <Sol>');
  });

  it('drops a non-http image and keeps a card without a link', () => {
    const out = renderCampaignEmail(base({
      properties: [{ title: 'Flat', location: null, propertyType: null, price: null, facts: [], image: 'javascript:alert(1)', url: null }],
    }));
    expect(out.html).not.toContain('javascript:');
    expect(out.html).toContain('Flat');
  });

  it('strips line breaks from the subject (no header injection)', () => {
    const out = renderCampaignEmail(base({ subject: 'Hi {{contact.name}}', contact: { name: 'A\r\nBcc: x@y', email: 'a@b.c' } }));
    expect(out.subject).not.toMatch(/[\r\n]/);
  });

  it('turns unknown placeholders into nothing', () => {
    expect(fillPlaceholders('a{{nope}}b{{ contact.email }}', { 'contact.email': 'x' }, false)).toBe('abx');
  });
});

describe('listing loop and agency placeholders', () => {
  const card = (over: Record<string, unknown> = {}) => ({
    title: 'Villa <Sol>', location: 'Marbella', propertyType: 'Villa', price: '€500,000', facts: ['3 bed'],
    image: 'https://img/x.jpg', url: 'https://site/p/1', reference: 'R1', beds: 3, baths: 2, area: '210 m²', ...over,
  });

  it('repeats the loop once per listing with escaped values', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '<table>{{#properties}}<tr><td><img src="{{property.image}}">{{property.title}} {{property.price}} {{property.beds}}/{{property.baths}} {{property.area}} {{property.reference}} <a href="{{property.url}}">Go</a></td></tr>{{/properties}}</table>{{unsubscribe_link}}',
      properties: [card(), card({ title: 'Flat', url: 'https://site/p/2', reference: 'R2' })] as never,
    }));
    expect(out.html).toContain('Villa &lt;Sol&gt; €500,000 3/2 210 m² R1');
    expect(out.html).toContain('href="https://site/p/2"');
    expect(out.html.match(/<tr>/g)).toHaveLength(2);
    expect(out.html).not.toContain('{{');
  });

  it('drops unsafe addresses inside the loop, and images left without an address', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '{{#properties}}<img src="{{property.image}}" alt="x"><a href="{{property.url}}">x</a>{{/properties}}',
      properties: [card({ image: 'javascript:alert(1)', url: 'data:text/html,hi' })] as never,
      pixelUrl: null,
    }));
    expect(out.html).not.toContain('<img');
    expect(out.html).toContain('<a href="">x</a>');
  });

  it('removes the loop when there are no listings and does not add the fixed cards', () => {
    const out = renderCampaignEmail(base({ bodyHtml: '<p>A</p>{{#properties}}<p>{{property.title}}</p>{{/properties}}<p>B</p>', properties: [] }));
    expect(out.html).toContain('<p>A</p><p>B</p>');
    const withCards = renderCampaignEmail(base({ bodyHtml: '{{#properties}}<b>{{property.title}}</b>{{/properties}}', properties: [card()] as never }));
    expect(withCards.html).not.toContain('border:1px solid #e2e8f0');
  });

  it('fills agency placeholders and only allows http(s) logo and website', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '<img src="{{agency.logo}}"> {{agency.phone}} {{agency.email}} <a href="{{agency.website}}">w</a> {{agency.color}}',
      color: '#112233',
      agencyInfo: { logo: 'https://cdn/logo.png', phone: '+34 600', email: 'info@sun.es', website: 'javascript:x' },
    }));
    expect(out.html).toContain('<img src="https://cdn/logo.png"> +34 600 info@sun.es <a href="">w</a> #112233');
    const noLogo = renderCampaignEmail(base({ bodyHtml: '<img src="{{agency.logo}}" alt="{{agency.name}}"><p>x</p>', pixelUrl: null }));
    expect(noLogo.html).not.toContain('<img');
  });

  it('renders the agency colour into a styled element after save and inlining', () => {
    const saved = checkTemplate('<p style="color:{{agency.color}};font-size:20px">New this week</p>{{unsubscribe_link}}').html;
    const out = renderCampaignEmail(base({ bodyHtml: inlineCss(saved), color: '#112233', pixelUrl: null }));
    expect(out.html).toMatch(/<p style="color: ?#112233; ?font-size: ?20px;?">New this week<\/p>/);
    const modern = LAYOUTS.find((l) => l.name === 'modern')!.html;
    const mail = renderCampaignEmail(base({ bodyHtml: inlineCss(checkTemplate(modern).html), color: '#112233', properties: [card()] as never }));
    expect(mail.html).toMatch(/color: ?#112233/);
    expect(mail.html).not.toContain('{{');
  });

  it('drops the logo link left empty when there is no logo, keeps other links', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '<a href="{{agency.website}}" style="text-decoration:none"><img src="{{agency.logo}}" alt="x"></a><a href="">keep</a><a href="https://x.test">  </a>{{unsubscribe_link}}',
      pixelUrl: null,
    }));
    expect(out.html).not.toMatch(/<a href="" style="text-decoration:none">/);
    expect(out.html).toContain('<a href="">keep</a>');
    expect(out.html).toContain('<a href="https://x.test">  </a>');
  });

  it('text version lists the listings and has no loop markup', () => {
    const out = renderCampaignEmail(base({ bodyHtml: '<p>Hi</p>{{#properties}}<p>{{property.title}}</p>{{/properties}}', properties: [card()] as never }));
    expect(out.text).toContain('Villa <Sol>');
    expect(out.text).not.toContain('{{');
  });
});

describe('batch B render fixes', () => {
  const card = (over: Record<string, unknown> = {}) => ({
    title: 'Villa', location: null, propertyType: null, price: null, facts: [], image: 'https://img/x.jpg', url: 'https://site/p/1', ...over,
  });

  it('a feed image inside a style url() cannot add a CSS declaration', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '{{#properties}}<td style="background:url({{property.image}})">x</td>{{/properties}}{{unsubscribe_link}}',
      properties: [card({ image: 'https://x/a.jpg);background:url(javascript:1' })] as never,
      pixelUrl: null,
    }));
    const style = out.html.match(/style="([^"]*)"/)![1];
    expect(style.startsWith('background:url(https://x/a.jpg')).toBe(true);
    expect(style.slice('background:url('.length, -1)).not.toMatch(/[;()'"\\{}<>\s]/);
    expect(style.endsWith(')')).toBe(true);
  });

  it('a contact name inside a style cannot break out of the declaration', () => {
    const out = renderCampaignEmail(base({
      bodyHtml: '<p style="font-family:{{contact.name}}">Hi {{contact.name}}</p>{{unsubscribe_link}}',
      contact: { name: 'x;}\n</p><b>"y\'(z)\\', email: 'a@b.c' },
      pixelUrl: null,
    }));
    const style = out.html.match(/style="([^"]*)"/)![1];
    expect(style).toBe('font-family:x/pbyz');
    // Outside the style attribute the value is only HTML-escaped as before.
    expect(out.html).toContain('Hi x;}');
  });

  it('a custom text version renders the loop as listing lines, without loop markers', () => {
    const out = renderCampaignEmail(base({
      bodyText: 'Hi {{contact.first_name}}\n{{#properties}}- {{property.title}}\n{{/properties}}Bye',
      properties: [card({ title: 'Casa Uno' })] as never,
    }));
    expect(out.text).not.toMatch(/\{\{|properties\}\}/);
    expect(out.text).toContain('Casa Uno');
    expect(out.text).toContain('Bye');
  });

  it('removes images with an unquoted empty src', () => {
    const out = renderCampaignEmail(base({ bodyHtml: '<p>a</p><img src= ><img alt="x" src=><img src=/><img src="https://ok/i.jpg">{{unsubscribe_link}}', pixelUrl: null }));
    expect(out.html.match(/<img/g)).toHaveLength(1);
    expect(out.html).toContain('src="https://ok/i.jpg"');
  });

  it('empty-src cleanup stays linear on 100 KB of unclosed tags', () => {
    for (const junk of ['<img '.repeat(20_000), '<img src=""'.repeat(9_000), '<a href=""'.repeat(10_000)]) {
      const t = Date.now();
      renderCampaignEmail(base({ bodyHtml: junk, pixelUrl: null }));
      expect(Date.now() - t).toBeLessThan(200);
    }
  });

  it('LOOP_TEST_RE is not global, so repeated .test calls give the same answer', () => {
    const s = '{{#properties}}x{{/properties}}';
    expect(LOOP_TEST_RE.global).toBe(false);
    expect([LOOP_TEST_RE.test(s), LOOP_TEST_RE.test(s)]).toEqual([true, true]);
  });
});

describe('campaign links', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = 'test-secret'; });
  afterAll(() => { process.env.JWT_SECRET = OLD; });

  it('signs per purpose and refuses swapped purposes', () => {
    const links = campaignLinks(42);
    const u = links.unsubscribeUrl.split('/').pop()!;
    const o = links.pixelUrl.split('/').pop()!;
    const c = links.propertyUrl(7).split('/').pop()!;
    expect(verifyCampaignToken('u', u)).toEqual({ sendId: 42 });
    expect(verifyCampaignToken('o', o)).toEqual({ sendId: 42 });
    expect(verifyCampaignToken('c', c)).toEqual({ sendId: 42, propertyId: 7 });
    expect(verifyCampaignToken('u', o)).toBeNull();
  });
});
