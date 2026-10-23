import { randomBytes } from 'crypto';
import sanitizeHtml = require('sanitize-html');
import juice = require('juice');
import { KNOWN_PLACEHOLDERS, LOOP_RE, PROPERTY_PLACEHOLDERS } from './campaign-render';

// Every template is cleaned before it is saved (by hand or by the AI): no
// scripts, forms or javascript: links, and the placeholders checked. Styles
// are moved inline only when the email is rendered (inlineCss), so the
// client's own code stays readable.

export const MAX_TEMPLATE_BYTES = 100 * 1024;

export interface TemplateCheck {
  html: string;
  errors: string[];
  warnings: string[];
}

const EMAIL_TAGS = [
  'html', 'head', 'body', 'meta', 'title', 'style', 'center', 'font', 'span', 'div', 'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'b', 'i', 'u', 's', 'strong', 'em', 'small', 'sup', 'sub',
  'ul', 'ol', 'li', 'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
];
const COMMON_ATTRS = [
  'style', 'class', 'id', 'align', 'valign', 'width', 'height', 'bgcolor', 'background', 'border',
  'cellpadding', 'cellspacing', 'role', 'dir', 'lang', 'title', 'colspan', 'rowspan', 'color', 'face', 'size',
];

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: EMAIL_TAGS,
  allowedAttributes: {
    '*': COMMON_ATTRS,
    a: [...COMMON_ATTRS, 'href', 'target', 'rel', 'name'],
    img: [...COMMON_ATTRS, 'src', 'alt'],
    // No http-equiv: a refresh meta could send the preview somewhere else.
    meta: ['charset', 'name', 'content'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'background'],
  allowProtocolRelative: false,
  // <style> is needed for the phone layout (@media); its content is not HTML.
  allowVulnerableTags: true,
  nonTextTags: ['script', 'textarea', 'option', 'noscript'],
};

const PLACEHOLDER_ANY = /\{\{\s*([#/]?)([a-z_]+(?:\.[a-z_]+)*)\s*\}\}/gi;

function unknownIn(text: string, allowed: Set<string>, seen: Set<string>, out: string[]): void {
  for (const [, mark, name] of text.matchAll(PLACEHOLDER_ANY)) {
    const key = name.toLowerCase();
    if (mark || allowed.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(`UNKNOWN:${key}`);
  }
}

// External stylesheets are not allowed: drop @import rules inside <style> blocks.
function stripImports(css: string): string {
  return css.replace(/@import\b[^;{}]*;?/gi, '');
}

// CSS escapes (`\69` = i, `\:`) decoded and comments removed, as a browser reads it.
function decodeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, '')
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_m, h: string) => codePoint(parseInt(h, 16)))
    .replace(/\\([^\n0-9a-f])/gi, '$1');
}

// A <style> block: plain @import rules removed; if an import still shows up
// once escapes and comments are read (`@\69mport`, `@/**/import`), or the
// block runs code (expression(), javascript:), the whole block goes.
function cleanStyleBlock(css: string): string | null {
  const kept = stripImports(css);
  const read = decodeCss(kept);
  if (/@import/i.test(read) || DANGEROUS_CSS.test(read.replace(/\s/g, ''))) return null;
  return kept;
}

// sanitize-html drops a whole style attribute it cannot parse as CSS, and
// `color:{{agency.color}}` is not CSS. So placeholders inside style values
// become plain identifiers first and come back after. The token carries a
// random value per call, so text a client types can never be turned into one.
const STYLE_ATTR = /(\sstyle\s*=\s*)("[^"]*"|'[^']*')/gi;

function protectStylePlaceholders(input: string): { html: string; restore: (html: string) => string } {
  const nonce = randomBytes(6).toString('hex');
  const saved: string[] = [];
  const html = input.replace(STYLE_ATTR, (_m, pre: string, value: string) =>
    pre + value.replace(PLACEHOLDER_ANY, (ph) => {
      saved.push(ph);
      return `__spm_ph_${nonce}_${saved.length - 1}__`;
    }));
  const token = new RegExp(`__spm_ph_${nonce}_(\\d+)__`, 'g');
  return { html, restore: (out) => (saved.length ? out.replace(token, (m, i: string) => saved[Number(i)] ?? m) : out) };
}

// Old IE / Firefox ways to run code from CSS: drop the whole style attribute.
// `behavior:` only as a whole property, so scroll-behavior / overscroll-behavior stay.
const DANGEROUS_CSS = /expression\(|javascript:|vbscript:|-moz-binding|(^|[;{])behavior:/i;

const codePoint = (n: number): string => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

function decodeEntities(v: string): string {
  return v
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d: string) => codePoint(Number(d)))
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&colon;/gi, ':').replace(/&lpar;/gi, '(').replace(/&amp;/gi, '&');
}

function dropDangerousStyles(html: string): string {
  return html.replace(/\sstyle="([^"]*)"/gi, (m, value: string) => {
    const css = decodeEntities(value).replace(/\/\*[\s\S]*?\*\//g, '').replace(/[\\\s]/g, '');
    return DANGEROUS_CSS.test(css) ? '' : m;
  });
}

export function checkTemplate(input: string): TemplateCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const hadDoctype = /^\s*<!doctype html/i.test(input);
  const guard = protectStylePlaceholders(input);
  let html = guard.restore(sanitizeHtml(guard.html, SANITIZE))
    .replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a: string, css: string, c: string) => {
      const kept = cleanStyleBlock(css);
      return kept === null ? '' : a + kept + c;
    });
  html = dropDangerousStyles(html);
  if (hadDoctype) html = `<!DOCTYPE html>\n${html}`;

  const opens = (html.match(/\{\{\s*#properties\s*\}\}/gi) || []).length;
  const closes = (html.match(/\{\{\s*\/properties\s*\}\}/gi) || []).length;
  const loops = html.match(LOOP_RE) || [];
  const nested = loops.some((l) => /\{\{\s*#properties/i.test(l.replace(/^\{\{\s*#properties\s*\}\}/i, '')));
  if (opens !== closes || loops.length !== opens || nested) errors.push('LOOP_UNBALANCED');

  const known = new Set<string>(KNOWN_PLACEHOLDERS);
  const inLoop = new Set<string>([...KNOWN_PLACEHOLDERS, ...PROPERTY_PLACEHOLDERS]);
  const seen = new Set<string>();
  unknownIn(html.replace(LOOP_RE, ''), known, seen, warnings);
  unknownIn(loops.join('\n'), inLoop, seen, warnings);

  if (!/\{\{\s*unsubscribe_link\s*\}\}/i.test(html)) warnings.push('NO_UNSUBSCRIBE');
  if (Buffer.byteLength(html, 'utf8') > MAX_TEMPLATE_BYTES) errors.push('TOO_LARGE');
  return { html, errors, warnings };
}

// The loop markers become comments while juice parses the HTML: plain text
// between table rows would otherwise be moved out of the table.
const OPEN_COMMENT = '<!--spm-loop-open-->';
const CLOSE_COMMENT = '<!--spm-loop-close-->';

export function inlineCss(html: string): string {
  const isDocument = /<html[\s>]/i.test(html);
  const marked = html
    .replace(/\{\{\s*#properties\s*\}\}/gi, OPEN_COMMENT)
    .replace(/\{\{\s*\/properties\s*\}\}/gi, CLOSE_COMMENT);
  let out = juice(marked, { preserveMediaQueries: true, removeStyleTags: true, applyWidthAttributes: true, applyHeightAttributes: true });
  if (!isDocument) {
    const body = out.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (body) out = body[1];
  }
  return out.split(OPEN_COMMENT).join('{{#properties}}').split(CLOSE_COMMENT).join('{{/properties}}');
}
