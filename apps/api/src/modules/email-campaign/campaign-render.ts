import { escapeHtml } from '../../common/security/escape-html';

// Builds one campaign email from the template the client wrote. Pure.
//
// Placeholders (HTML-escaped in the body, plain in the subject and text):
//   {{contact.name}} {{contact.first_name}} {{contact.email}} {{agency.name}}
//   {{agency.logo}} {{agency.phone}} {{agency.email}} {{agency.website}} {{agency.color}}
//   {{properties}}        the featured listings as cards (body only)
//   {{#properties}} … {{/properties}}  repeats its content per featured listing, with
//     {{property.title}} {{property.price}} {{property.location}} {{property.type}}
//     {{property.reference}} {{property.beds}} {{property.baths}} {{property.area}}
//     {{property.image}} {{property.url}}
//   {{unsubscribe_link}}  the contact's unsubscribe address
// A body without {{properties}} gets the cards after its own content; a body
// without {{unsubscribe_link}} gets an unsubscribe footer, so every email
// carries one.

export interface CampaignPropertyCard {
  title: string;
  location: string | null;
  propertyType: string | null;
  price: string | null;
  facts: string[];
  image: string | null;
  url: string | null;
  // Only the listing loop uses these.
  reference?: string;
  beds?: number | null;
  baths?: number | null;
  area?: string | null;
}

export interface AgencyInfo {
  logo?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

export interface CampaignRenderInput {
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
  contact: { name: string | null; email: string };
  agency: string;
  agencyInfo?: AgencyInfo;
  color?: string;
  properties: CampaignPropertyCard[];
  unsubscribeUrl: string;
  pixelUrl?: string | null;
  texts?: { view?: string; unsubscribe?: string; unsubscribeText?: string };
}

export interface CampaignRendered {
  subject: string;
  html: string;
  text: string;
}

const PLACEHOLDER = /\{\{\s*([a-z_]+(?:\.[a-z_]+)*)\s*\}\}/gi;

// Global: for .replace / .match only. Use LOOP_TEST_RE for .test / .exec
// (a global regex keeps lastIndex between calls).
export const LOOP_RE = /\{\{\s*#properties\s*\}\}([\s\S]*?)\{\{\s*\/properties\s*\}\}/gi;
export const LOOP_TEST_RE = /\{\{\s*#properties\s*\}\}([\s\S]*?)\{\{\s*\/properties\s*\}\}/i;

export const PROPERTY_PLACEHOLDERS = [
  'property.title', 'property.price', 'property.location', 'property.type', 'property.reference',
  'property.beds', 'property.baths', 'property.area', 'property.image', 'property.url',
] as const;

export const KNOWN_PLACEHOLDERS = [
  'contact.name', 'contact.first_name', 'contact.email',
  'agency.name', 'agency.logo', 'agency.phone', 'agency.email', 'agency.website', 'agency.color',
  'properties', 'unsubscribe_link',
] as const;

// Image and link addresses from data: only http(s), anything else becomes empty.
export function safeUrl(u: string | null | undefined): string {
  const v = (u || '').trim();
  return /^https?:\/\//i.test(v) ? v : '';
}

function propertyValues(c: CampaignPropertyCard): Record<string, string> {
  return {
    'property.title': c.title,
    'property.price': c.price ?? '',
    'property.location': c.location ?? '',
    'property.type': c.propertyType ?? '',
    'property.reference': c.reference ?? '',
    'property.beds': c.beds ? String(c.beds) : '',
    'property.baths': c.baths ? String(c.baths) : '',
    'property.area': c.area ?? '',
    'property.image': safeUrl(c.image),
    'property.url': safeUrl(c.url),
  };
}

function vars(input: CampaignRenderInput, color: string): Record<string, string> {
  const name = (input.contact.name || '').trim();
  const info = input.agencyInfo || {};
  return {
    'contact.name': name,
    'contact.first_name': name.split(/\s+/)[0] || '',
    'contact.email': input.contact.email,
    'agency.name': input.agency,
    'agency.logo': safeUrl(info.logo),
    'agency.phone': (info.phone || '').trim(),
    'agency.email': (info.email || '').trim(),
    'agency.website': safeUrl(info.website),
    'agency.color': color,
    unsubscribe_link: input.unsubscribeUrl,
  };
}

// Placeholders that hold an address (passed through safeUrl, or our own link).
const URL_KEYS = new Set(['property.image', 'property.url', 'agency.logo', 'agency.website', 'unsubscribe_link']);

// A value inside a style="…" attribute must stay one CSS value: an address
// keeps only its http(s) URL with CSS-breaking characters percent-encoded;
// any other value loses those characters.
export function cssSafe(key: string, v: string): string {
  if (URL_KEYS.has(key)) {
    return safeUrl(v).replace(/[()'"\\;{}<>\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  }
  return v.replace(/[;{}()<>"'\\\r\n]/g, '');
}

const STYLE_VALUE = /(\sstyle\s*=\s*)("[^"]*"|'[^']*')/gi;

// Replaces the placeholders; unknown ones become empty. `html` escapes
// values, and first makes those inside style attributes CSS-safe.
export function fillPlaceholders(template: string, values: Record<string, string>, html: boolean): string {
  const value = (key: string) => values[key.toLowerCase()] ?? '';
  if (!html) return template.replace(PLACEHOLDER, (_, key: string) => value(key));
  return template
    .replace(STYLE_VALUE, (_m, pre: string, attr: string) =>
      pre + attr.replace(PLACEHOLDER, (_p, key: string) => escapeHtml(cssSafe(key.toLowerCase(), value(key)))))
    .replace(PLACEHOLDER, (_, key: string) => escapeHtml(value(key)));
}

export function propertyCardsHtml(cards: CampaignPropertyCard[], color: string, viewText: string): string {
  if (!cards.length) return '';
  const rows = cards.map((c) => {
    const img = c.image && /^https?:\/\//i.test(c.image)
      ? `<img src="${escapeHtml(c.image)}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border-radius:6px 6px 0 0">`
      : '';
    const place = [c.propertyType, c.location].filter(Boolean).map(escapeHtml).join(' · ');
    const facts = c.facts.length ? `<p style="margin:4px 0 0;color:#475569;font-size:14px">${c.facts.map(escapeHtml).join(' · ')}</p>` : '';
    const link = c.url
      ? `<p style="margin:12px 0 0"><a href="${escapeHtml(c.url)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:8px 16px;border-radius:5px;font-size:14px">${escapeHtml(viewText)}</a></p>`
      : '';
    const title = c.url
      ? `<a href="${escapeHtml(c.url)}" style="color:#0f172a;text-decoration:none">${escapeHtml(c.title)}</a>`
      : escapeHtml(c.title);
    return `<tr><td style="padding:0 0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px">
<tr><td>${img}</td></tr>
<tr><td style="padding:14px 16px">
<p style="margin:0;font-size:16px;font-weight:600">${title}</p>
${place ? `<p style="margin:4px 0 0;color:#64748b;font-size:13px">${place}</p>` : ''}
${c.price ? `<p style="margin:8px 0 0;font-size:17px;font-weight:700;color:${color}">${escapeHtml(c.price)}</p>` : ''}
${facts}${link}
</td></tr></table></td></tr>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:16px auto">${rows.join('')}</table>`;
}

// <script>/<style> blocks removed in one pass; an unclosed one stops the scan
// (nothing after it can close), so junk input stays linear.
function stripBlocks(html: string): string {
  const open = /<(script|style)\b/gi;
  let out = '';
  let from = 0;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const close = new RegExp(`</${m[1]}>`, 'gi');
    close.lastIndex = m.index;
    const c = close.exec(html);
    if (!c) break;
    out += html.slice(from, m.index);
    from = c.index + c[0].length;
    open.lastIndex = from;
  }
  return out + html.slice(from);
}

// Links become "label (href)". Only the part up to the last </a> can hold a
// whole link, so the lazy label scan never runs on past it (linear on junk).
function linksToText(html: string): string {
  let last = -1;
  for (const m of html.matchAll(/<\/a>/gi)) last = m.index! + m[0].length;
  if (last < 0) return html;
  return html.slice(0, last).replace(/<a\s[^<>]*?href="([^"]+)"[^<>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) =>
    `${label.replace(/<[^<>]+>/g, '').trim()} (${href})`) + html.slice(last);
}

function htmlToText(html: string): string {
  // Tags are `<[^<>]+>`: a scan stops at the next `<`, so unclosed `<img <img …` stays linear.
  return linksToText(stripBlocks(html))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^<>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const EMPTY_SRC = /\ssrc\s*=\s*(""|''|(?=\/?>))/i;
const EMPTY_HREF = /\shref=(""|'')/i;
// Sticky: must match right where the <a> tag ends.
const EMPTY_LINK_END = /\s*<\/a>/iy;

// Removes each `<name …>` tag that `drop` picks (plus what the sticky `tail`
// matches right after it, e.g. `</a>`). One pass: a tag ends at the next `>`,
// so unclosed junk (`<img <img …`) costs linear time, not a rescan per start.
function dropTags(html: string, name: string, drop: (tag: string) => boolean, tail?: RegExp): string {
  const open = new RegExp(`<${name}\\b`, 'gi');
  let out = '';
  let from = 0;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const end = html.indexOf('>', m.index);
    if (end < 0) break;
    const tag = html.slice(m.index, end + 1);
    let stop = end + 1;
    if (drop(tag)) {
      let rest: RegExpExecArray | null = null;
      if (tail) {
        tail.lastIndex = stop;
        rest = tail.exec(html);
      }
      if (!tail || rest) {
        if (rest) stop += rest[0].length;
        out += html.slice(from, m.index);
        from = stop;
      }
    }
    open.lastIndex = stop;
  }
  return out + html.slice(from);
}

export function renderCampaignEmail(input: CampaignRenderInput): CampaignRendered {
  const color = /^#[0-9a-f]{6}$/i.test(input.color ?? '') ? input.color! : '#1e293b';
  const t = {
    view: input.texts?.view || 'View property',
    unsubscribe: input.texts?.unsubscribe || 'Unsubscribe',
    unsubscribeText: input.texts?.unsubscribeText || "Don't want these emails any more?",
  };
  const values = vars(input, color);
  const cards = propertyCardsHtml(input.properties, color, t.view);

  // Loops and {{properties}} are markup, so they are swapped in after the escaped fill.
  const MARK = '\u0000SPM_PROPERTIES\u0000';
  const loopMark = (i: number) => `\u0000SPM_LOOP_${i}\u0000`;
  const loops: string[] = [];
  const body = input.bodyHtml.replace(LOOP_RE, (_, inner: string) => {
    loops.push(inner);
    return loopMark(loops.length - 1);
  });
  const hasCardsSlot = loops.length > 0 || /\{\{\s*properties\s*\}\}/i.test(body);
  let html = fillPlaceholders(body.replace(/\{\{\s*properties\s*\}\}/gi, MARK), values, true);
  html = html.split(MARK).join(cards);
  loops.forEach((inner, i) => {
    const block = input.properties.map((c) => fillPlaceholders(inner, { ...values, ...propertyValues(c) }, true)).join('');
    html = html.split(loopMark(i)).join(block);
  });

  // A placeholder image with no address (no logo, listing without photo) would show a broken icon.
  // Also an unquoted empty one: `<img src= >`, `<img src=>`, `<img src=/>`.
  html = dropTags(html, 'img', (tag) => EMPTY_SRC.test(tag));
  // ...and the link that wrapped it (the logo link) is then left empty: drop it too.
  html = dropTags(html, 'a', (tag) => EMPTY_HREF.test(tag), EMPTY_LINK_END);

  const extra: string[] = [];
  if (!hasCardsSlot && cards) extra.push(cards);
  if (!/\{\{\s*unsubscribe_link\s*\}\}/i.test(input.bodyHtml)) {
    extra.push(
      `<p style="margin:24px 0 0;font-size:12px;color:#64748b;text-align:center">${escapeHtml(t.unsubscribeText)} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#64748b">${escapeHtml(t.unsubscribe)}</a></p>`,
    );
  }
  if (input.pixelUrl) {
    extra.push(`<img src="${escapeHtml(input.pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`);
  }
  if (extra.length) {
    const tail = extra.join('\n');
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tail}</body>`) : `${html}\n${tail}`;
  }

  const textBody = input.bodyText?.trim()
    // The listings follow as plain lines below, as for the HTML-derived text, so the loop goes.
    ? fillPlaceholders(input.bodyText.replace(LOOP_RE, ''), { ...values, properties: '' }, false)
    : htmlToText(fillPlaceholders(input.bodyHtml.replace(LOOP_RE, '').replace(/\{\{\s*properties\s*\}\}/gi, ''), values, true));
  const propertyLines = input.properties.map((c) =>
    [c.title, [c.price, ...c.facts].filter(Boolean).join(' · '), c.url].filter(Boolean).join('\n'),
  );
  const text = [
    textBody,
    ...(propertyLines.length ? ['', propertyLines.join('\n\n')] : []),
    '',
    `${t.unsubscribeText} ${t.unsubscribe}: ${input.unsubscribeUrl}`,
  ].join('\n');

  return {
    subject: fillPlaceholders(input.subject, values, false).replace(/[\r\n]+/g, ' ').trim(),
    html,
    text,
  };
}
