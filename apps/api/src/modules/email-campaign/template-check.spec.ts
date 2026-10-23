import { checkTemplate, inlineCss, MAX_TEMPLATE_BYTES } from './template-check';
import { LAYOUTS } from './designer/layouts';

const styleCount = (h: string) => (h.match(/\sstyle="/g) || []).length;

// The editor's "Listing loop" snippet (dashboard insert-menu.tsx LOOP_SNIPPET).
const LOOP_LIKE = `{{#properties}}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
  <tr><td><a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="560" style="display:block;width:100%;height:auto;border:0"></a></td></tr>
  <tr><td style="padding:12px 0 0;font-family:Arial,sans-serif">
    <p style="margin:0 0 10px;font-size:18px;font-weight:bold;color:{{agency.color}}">{{property.price}}</p>
    <a href="{{property.url}}" style="display:inline-block;padding:10px 18px;background:{{agency.color}};color:#ffffff">View property</a>
  </td></tr>
</table>
{{/properties}}<a href="{{unsubscribe_link}}">u</a>`;

describe('checkTemplate', () => {
  it('removes scripts, event handlers, forms, iframes and javascript: links', () => {
    const out = checkTemplate('<p onclick="x()">Hi</p><script>alert(1)</script><form><input></form><iframe src="https://x"></iframe><a href="javascript:alert(1)">a</a>{{unsubscribe_link}}');
    expect(out.html).not.toMatch(/script|onclick|<form|<input|<iframe|javascript:/i);
    expect(out.html).toContain('<p>Hi</p>');
  });

  it('keeps email markup, style blocks, placeholders and the loop', () => {
    const src = '<!DOCTYPE html><html><head><style>@media (max-width:600px){.c{width:100%!important}}</style></head><body><table role="presentation" width="600" cellpadding="0" bgcolor="#ffffff"><tr><td class="c" style="padding:8px">{{#properties}}<a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="280"></a>{{/properties}}</td></tr></table><a href="{{unsubscribe_link}}">u</a></body></html>';
    const out = checkTemplate(src);
    expect(out.errors).toEqual([]);
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('@media (max-width:600px)');
    expect(out.html).toContain('href="{{property.url}}"');
    expect(out.html).toContain('{{#properties}}');
    expect(out.html).toContain('bgcolor="#ffffff"');
  });

  it('reports an unbalanced loop and unknown placeholders', () => {
    const out = checkTemplate('{{#properties}}<p>{{property.title}}</p> {{contact.nam}} {{unsubscribe_link}}');
    expect(out.errors).toContain('LOOP_UNBALANCED');
    expect(out.warnings).toContain('UNKNOWN:contact.nam');
  });

  it('flags property placeholders outside the loop and a missing unsubscribe link', () => {
    const out = checkTemplate('<p>{{property.title}}</p>');
    expect(out.warnings).toContain('UNKNOWN:property.title');
    expect(out.warnings).toContain('NO_UNSUBSCRIBE');
  });

  it('rejects templates over the size limit', () => {
    expect(checkTemplate(`<p>${'x'.repeat(MAX_TEMPLATE_BYTES + 10)}</p>`).errors).toContain('TOO_LARGE');
  });

  it('keeps scroll-behavior / overscroll-behavior but drops an IE behavior: rule', () => {
    expect(checkTemplate('<p style="scroll-behavior:smooth;color:red">a</p>{{unsubscribe_link}}').html).toContain('style="scroll-behavior:smooth;color:red"');
    expect(checkTemplate('<p style="overscroll-behavior: none">a</p>{{unsubscribe_link}}').html).toContain('overscroll-behavior');
    expect(styleCount(checkTemplate('<p style="behavior:url(x)">a</p>{{unsubscribe_link}}').html)).toBe(0);
    expect(styleCount(checkTemplate('<p style="color:red; behavior: url(x)">a</p>{{unsubscribe_link}}').html)).toBe(0);
  });

  it('drops http-equiv from meta (a refresh meta could redirect the preview)', () => {
    const out = checkTemplate('<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=https://evil.example"></head><body>Hi {{unsubscribe_link}}</body></html>').html;
    expect(out).not.toMatch(/http-equiv/i);
    expect(out).toContain('<meta charset="utf-8"');
  });

  it('strips @import rules from style blocks but keeps the other rules', () => {
    const out = checkTemplate('<style>@import url("https://evil.example/x.css"); @import \'https://evil.example/y.css\'; .a{color:red}</style><p class="a">Hi</p>{{unsubscribe_link}}');
    expect(out.html).not.toMatch(/@import|evil\.example/i);
    expect(out.html).toContain('.a{color:red}');
  });

  it('drops a style block whose @import is hidden by CSS escapes or comments', () => {
    for (const css of ['@\\69mport url(https://evil.example/a.css);', '@\\000069 mport "https://evil.example/b.css";', '@/**/import url(https://evil.example/c.css);', '@im/* x */port "https://evil.example/d.css";']) {
      const out = checkTemplate(`<style>${css} .a{color:red}</style><p class="a">Hi</p>{{unsubscribe_link}}`);
      expect(out.html).not.toMatch(/evil\.example|<style/i);
      expect(out.html).toContain('<p class="a">Hi</p>');
    }
  });

  it('drops a style block with expression() or url(javascript:), also when escaped', () => {
    for (const css of ['.a{width:expression(alert(1))}', '.a{background:url(javascript:alert(1))}', '.a{background:url(\\6a avascript:alert(1))}', '.a{width:ex/**/pression(alert(1))}']) {
      const out = checkTemplate(`<style>${css}</style><p class="a">Hi</p>{{unsubscribe_link}}`);
      expect(out.html).not.toMatch(/<style|expression|javascript/i);
    }
    const ok = checkTemplate('<style>@media (max-width:600px){.c{width:100%!important}} .x{scroll-behavior:smooth}</style><p>Hi</p>{{unsubscribe_link}}');
    expect(ok.html).toContain('@media (max-width:600px)');
    expect(ok.html).toContain('scroll-behavior:smooth');
  });

  describe('placeholders inside style attributes', () => {
    it.each(LAYOUTS.map((l) => [l.name, l.html]))('keeps every style attribute of the %s layout', (_name, html) => {
      const out = checkTemplate(html);
      expect(out.errors).toEqual([]);
      expect(styleCount(out.html)).toBe(styleCount(html));
    });

    it('keeps a style with an agency colour placeholder as written', () => {
      const out = checkTemplate('<p style="color:{{agency.color}};font-size:20px">Hi</p>{{unsubscribe_link}}');
      expect(out.html).toContain('<p style="color:{{agency.color}};font-size:20px">Hi</p>');
    });

    it('keeps the listing loop snippet styles', () => {
      const out = checkTemplate(LOOP_LIKE);
      expect(out.errors).toEqual([]);
      expect(styleCount(out.html)).toBe(styleCount(LOOP_LIKE));
      expect(out.html).toContain('color:{{agency.color}}">{{property.price}}');
      expect(out.html).toContain('background:{{agency.color}};color:#ffffff');
    });

    it('still drops styles with expression() or javascript:, with or without a placeholder', () => {
      for (const st of ['width:expression(alert(1))', 'background:url(javascript:alert(1))', 'color:{{agency.color}};width:expression(alert(1))', 'background:url(&quot;javascript:x&quot;);color:{{agency.color}}']) {
        const out = checkTemplate(`<p style="${st}">Hi</p>{{unsubscribe_link}}`);
        expect(out.html).toContain('<p>Hi</p>');
        expect(out.html).not.toMatch(/expression|javascript/i);
      }
    });

    it('does not turn typed token-like text into a placeholder', () => {
      const out = checkTemplate('<p style="color:__spm_ph_0__">__spm_ph_0__ spmph0</p>{{unsubscribe_link}}');
      expect(out.html).toContain('style="color:__spm_ph_0__"');
      expect(out.html).toContain('>__spm_ph_0__ spmph0</p>');
    });
  });
});

describe('inlineCss', () => {
  it('keeps placeholders inside style attributes while merging class rules', () => {
    const out = inlineCss('<style>p{margin:0}</style><p style="color:{{agency.color}};font-size:20px">Hi</p>');
    expect(out).toMatch(/style="margin: ?0; ?color: ?\{\{agency\.color\}\}; ?font-size: ?20px;?"/);
  });

  it('moves class styles inline, keeps media queries and the loop inside a table', () => {
    const out = inlineCss('<html><head><style>.t{color:#f00} @media (max-width:600px){.t{color:#00f}}</style></head><body><table><tbody>{{#properties}}<tr><td class="t">{{property.title}}</td></tr>{{/properties}}</tbody></table></body></html>');
    expect(out).toMatch(/<td class="t" style="color: ?#f00;?">/);
    expect(out).toContain('@media (max-width:600px)');
    expect(out.indexOf('{{#properties}}')).toBeLessThan(out.indexOf('<tr>'));
    expect(out.indexOf('{{/properties}}')).toBeGreaterThan(out.indexOf('</tr>'));
  });

  it('does not wrap a fragment in html/body', () => {
    expect(inlineCss('<style>p{margin:0}</style><p>Hi</p>')).not.toMatch(/<html|<body/i);
  });
});
