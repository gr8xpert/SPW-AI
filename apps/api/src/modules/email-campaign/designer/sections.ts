import { escapeHtml } from '../../../common/security/escape-html';

// The building blocks of a design: hand-built, email-safe sections (tables,
// inline styles, one @media block) that work in every theme. The starter
// designs and the AI designer both put emails together from these, so the
// result is never down to what a model happens to write that day.

export const THEME_NAMES = ['classic', 'editorial', 'midnight', 'bright', 'coast', 'terracotta'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export interface Theme {
  page: string;
  card: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  onAccent: string;
  soft: string;
  font: string;
  heading: string;
  radius: number;
  headingWeight: 'normal' | 'bold';
  dark?: boolean;
}

const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const BRAND = { accent: '{{agency.color}}', onAccent: '{{agency.on_color}}', soft: '{{agency.color_soft}}' };

export const THEMES: Record<ThemeName, Theme> = {
  classic: { page: '#eef1f5', card: '#ffffff', text: '#16202c', muted: '#566271', line: '#dde3ea', ...BRAND, font: SANS, heading: SERIF, radius: 4, headingWeight: 'normal' },
  editorial: { page: '#f4efe7', card: '#fffdf9', text: '#2a2420', muted: '#6f655b', line: '#e6ddd0', ...BRAND, font: SANS, heading: SERIF, radius: 0, headingWeight: 'normal' },
  midnight: { page: '#0d1117', card: '#151b23', text: '#f3efe6', muted: '#b4b0a7', line: '#2b333e', accent: '#c8a45d', onAccent: '#14110a', soft: '#1d242e', font: SANS, heading: SERIF, radius: 0, headingWeight: 'normal', dark: true },
  bright: { page: '#f6f7f9', card: '#ffffff', text: '#111827', muted: '#4b5563', line: '#e5e7eb', ...BRAND, font: SANS, heading: SANS, radius: 12, headingWeight: 'bold' },
  coast: { page: '#e8f1f2', card: '#ffffff', text: '#12343b', muted: '#4a6a70', line: '#d3e3e5', accent: '#0e7490', onAccent: '#ffffff', soft: '#e6f4f6', font: SANS, heading: SANS, radius: 8, headingWeight: 'bold' },
  terracotta: { page: '#f6ede6', card: '#fffaf6', text: '#33221a', muted: '#75594a', line: '#eadbcf', accent: '#a9482a', onAccent: '#ffffff', soft: '#f8e8df', font: SANS, heading: SERIF, radius: 2, headingWeight: 'normal' },
};

// The words in a design. Everything can be replaced, so a design can be in the
// client's language from the start. Placeholders are allowed.
export interface SectionCopy {
  kicker?: string;
  headline?: string;
  intro?: string;
  body?: string;
  cta?: string;
  ctaUrl?: string;
  view?: string;
  moreTitle?: string;
  contactTitle?: string;
  contactText?: string;
  quote?: string;
  quoteBy?: string;
  points?: { title: string; text: string }[];
  imageUrl?: string;
  imageAlt?: string;
  footerText?: string;
  unsubscribe?: string;
}

const DEFAULTS: Required<Omit<SectionCopy, 'imageUrl' | 'imageAlt'>> = {
  kicker: 'Selected for you',
  headline: 'Homes we think you will love',
  intro: 'Hello {{contact.first_name}}, here is a short selection from our latest listings.',
  body: 'Write a few short sentences here.',
  cta: 'See all properties',
  ctaUrl: '{{agency.website}}',
  view: 'View property',
  moreTitle: 'More homes to explore',
  contactTitle: 'Talk to {{agency.name}}',
  contactText: 'Tell us what you are looking for and we will find the right home with you.',
  quote: 'Write a real client quote here.',
  quoteBy: 'Client name',
  points: [
    { title: 'Local knowledge', text: 'We know these streets, prices and developments.' },
    { title: 'Honest advice', text: 'Straight answers from the first viewing to the keys.' },
    { title: 'Full support', text: 'Legal, finance and paperwork handled with you.' },
  ],
  footerText: 'You receive this email because you asked for property updates from us.',
  unsubscribe: 'Unsubscribe',
};

const clean = (v: string) => escapeHtml(v);
type Ctx = { t: Theme; c: Required<Omit<SectionCopy, 'imageUrl' | 'imageAlt'>> & Pick<SectionCopy, 'imageUrl' | 'imageAlt'> };

const headingCss = (t: Theme, size: number, line: number) => `font-family:${t.heading};font-size:${size}px;line-height:${line}px;font-weight:${t.headingWeight};color:${t.text}`;
const small = (t: Theme) => `font-size:12px;line-height:18px;letter-spacing:1.5px;text-transform:uppercase;color:${t.accent}`;
const photo = (width: number, radius: number) => `<a href="{{property.url}}" style="text-decoration:none"><img src="{{property.image}}" alt="{{property.title}}" width="${width}" class="fill" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:${radius}px"></a>`;

export const button = (t: Theme, label: string, href: string, bg = t.accent, fg = t.onAccent) => `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:${t.radius}px;background:${bg}">
<a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${t.font};font-size:15px;line-height:20px;font-weight:bold;color:${fg};text-decoration:none;border-radius:${t.radius}px">${label}</a>
</td></tr></table>`;

// On a dark or brand-coloured block the logo sits on a white plate: most logos are
// dark lettering on a transparent background and would vanish otherwise.
const PLATE = 'background:#ffffff;padding:8px 12px;border-radius:4px;';
const logo = (color: string, t: Theme, plate = !!t.dark) => `<a href="{{agency.website}}" style="text-decoration:none"><img src="{{agency.logo}}" alt="{{agency.name}}" height="44" style="${plate ? PLATE : ''}height:44px;border:0;display:inline-block;color:${color};font-family:${t.heading};font-size:22px"></a>`;

const logoRow = (t: Theme, align: 'left' | 'center') => `<tr><td class="px" align="${align}" style="padding:28px 40px;background:${t.card};border-bottom:1px solid ${t.line}">${logo(t.text, t)}</td></tr>`;

const listingLabel = (t: Theme) => `<p style="margin:0 0 6px;${small(t)}">{{property.location}}</p>`;

export const SECTIONS = {
  // Headers
  'logo-center': ({ t }: Ctx) => logoRow(t, 'center'),
  'logo-left': ({ t }: Ctx) => logoRow(t, 'left'),
  'logo-brand': ({ t }: Ctx) => `<tr><td class="px" align="center" style="padding:30px 40px;background:${t.accent}">${logo(t.onAccent, t, true)}</td></tr>`,
  'logo-phone': ({ t }: Ctx) => `<tr><td class="px" style="padding:22px 40px;background:${t.card};border-bottom:1px solid ${t.line}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td align="left" valign="middle">${logo(t.text, t)}</td>
<td align="right" valign="middle" style="font-size:14px;line-height:20px;color:${t.muted}"><a href="tel:{{agency.phone}}" style="color:${t.text};font-weight:bold;text-decoration:none">{{agency.phone}}</a></td>
</tr></table></td></tr>`,

  // Openings
  'hero-text': ({ t, c }: Ctx) => `<tr><td class="px" style="padding:44px 40px 20px">
<p style="margin:0 0 10px;${small(t)}">${c.kicker}</p>
<h1 class="h1" style="margin:0 0 16px;${headingCss(t, 36, 42)}">${c.headline}</h1>
<p style="margin:0;font-size:17px;line-height:27px;color:${t.muted}">${c.intro}</p>
</td></tr>`,
  'hero-center': ({ t, c }: Ctx) => `<tr><td class="px" align="center" style="padding:52px 48px 28px;text-align:center">
<p style="margin:0 0 12px;${small(t)}">${c.kicker}</p>
<h1 class="h1" style="margin:0 0 18px;${headingCss(t, 40, 46)}">${c.headline}</h1>
<p style="margin:0;font-size:17px;line-height:27px;color:${t.muted}">${c.intro}</p>
</td></tr>`,
  'hero-band': ({ t, c }: Ctx) => `<tr><td class="px" style="padding:52px 40px;background:${t.accent}">
<p style="margin:0 0 10px;font-size:12px;line-height:18px;letter-spacing:1.5px;text-transform:uppercase;color:${t.onAccent}">${c.kicker}</p>
<h1 class="h1" style="margin:0 0 16px;font-family:${t.heading};font-size:38px;line-height:44px;font-weight:${t.headingWeight};color:${t.onAccent}">${c.headline}</h1>
<p style="margin:0;font-size:17px;line-height:27px;color:${t.onAccent}">${c.intro}</p>
</td></tr>`,
  // The first listing's photo edge to edge, opening the email.
  'hero-photo': ({ t }: Ctx) => `{{#lead_property}}<tr><td style="padding:0;font-size:0;line-height:0">
<a href="{{property.url}}" style="text-decoration:none"><img src="{{property.image}}" alt="{{property.title}}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a>
</td></tr>
<tr><td class="px" style="padding:18px 40px;background:${t.accent}">
<p style="margin:0;font-family:${t.heading};font-size:24px;line-height:30px;font-weight:bold;color:${t.onAccent}">{{property.price}}</p>
<p style="margin:2px 0 0;font-size:14px;line-height:20px;color:${t.onAccent}">{{property.location}}</p>
</td></tr>{{/lead_property}}`,

  // Listings
  'lead-feature': ({ t, c }: Ctx) => `{{#lead_property}}<tr><td class="px" style="padding:24px 40px 12px">
${photo(520, t.radius)}
<p style="margin:20px 0 6px;${small(t)}">{{property.location}} · {{property.type}}</p>
<h2 style="margin:0 0 10px;${headingCss(t, 28, 34)}">{{property.title}}</h2>
<p style="margin:0 0 6px;font-size:15px;line-height:22px;color:${t.muted}">{{property.facts}}</p>
<p style="margin:0 0 18px;font-size:24px;line-height:30px;font-weight:bold;color:${t.text}">{{property.price}}</p>
${button(t, c.view, '{{property.url}}')}
</td></tr>{{/lead_property}}`,
  'lead-details': ({ t, c }: Ctx) => `{{#lead_property}}<tr><td class="px" style="padding:30px 40px 12px">
<h2 style="margin:0 0 8px;${headingCss(t, 28, 34)}">{{property.title}}</h2>
<p style="margin:0 0 20px;font-size:15px;line-height:22px;color:${t.muted}">{{property.type}} · {{property.facts}}</p>
${button(t, c.view, '{{property.url}}')}
</td></tr>{{/lead_property}}`,
  'lead-split': ({ t, c }: Ctx) => `{{#lead_property}}<tr><td class="px" style="padding:24px 30px 12px">
<table role="presentation" class="stack" align="left" width="290" cellpadding="0" cellspacing="0" style="width:290px"><tr><td style="padding:0 10px 16px">${photo(270, t.radius)}</td></tr></table>
<table role="presentation" class="stack" align="left" width="250" cellpadding="0" cellspacing="0" style="width:250px"><tr><td style="padding:0 10px 16px">
${listingLabel(t)}
<h2 style="margin:0 0 8px;${headingCss(t, 22, 28)}">{{property.title}}</h2>
<p style="margin:0 0 6px;font-size:14px;line-height:21px;color:${t.muted}">{{property.facts}}</p>
<p style="margin:0 0 14px;font-size:20px;line-height:26px;font-weight:bold;color:${t.text}">{{property.price}}</p>
${button(t, c.view, '{{property.url}}')}
</td></tr></table>
</td></tr>{{/lead_property}}`,
  'grid-all': ({ t, c }: Ctx) => `<tr><td class="px" style="padding:16px 30px 12px">
{{#properties}}${gridCard(t, c.view)}{{/properties}}
</td></tr>`,
  'grid-others': ({ t, c }: Ctx) => `{{#has_other_properties}}<tr><td class="px" style="padding:28px 40px 4px"><h2 style="margin:0;${headingCss(t, 22, 28)}">${c.moreTitle}</h2></td></tr>
<tr><td class="px" style="padding:16px 30px 12px">
{{#other_properties}}${gridCard(t, c.view)}{{/other_properties}}
</td></tr>{{/has_other_properties}}`,
  'stack-all': ({ t, c }: Ctx) => `<tr><td class="px" style="padding:16px 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
{{#properties}}<tr><td style="padding:0 0 36px">
${photo(520, t.radius)}
<p style="margin:18px 0 6px;${small(t)}">{{property.location}} · {{property.type}}</p>
<h2 style="margin:0 0 8px;${headingCss(t, 24, 30)}">{{property.title}}</h2>
<p style="margin:0 0 6px;font-size:15px;line-height:22px;color:${t.muted}">{{property.facts}}</p>
<p style="margin:0 0 16px;font-size:21px;line-height:27px;font-weight:bold;color:${t.text}">{{property.price}}</p>
${button(t, c.view, '{{property.url}}')}
</td></tr>{{/properties}}
</table></td></tr>`,
  'rows-all': ({ t, c }: Ctx) => `<tr><td class="px" style="padding:16px 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
{{#properties}}${rowCard(t, c.view)}{{/properties}}
</table></td></tr>`,
  'rows-others': ({ t, c }: Ctx) => `{{#has_other_properties}}<tr><td class="px" style="padding:28px 40px 4px"><h2 style="margin:0;${headingCss(t, 22, 28)}">${c.moreTitle}</h2></td></tr>
<tr><td class="px" style="padding:12px 40px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
{{#other_properties}}${rowCard(t, c.view)}{{/other_properties}}
</table></td></tr>{{/has_other_properties}}`,

  // Content
  'text-block': ({ t, c }: Ctx) => `<tr><td class="px" style="padding:20px 40px"><p style="margin:0;font-size:16px;line-height:26px;color:${t.text}">${c.body}</p></td></tr>`,
  'image-banner': ({ c }: Ctx) => (c.imageUrl ? `<tr><td style="padding:0;font-size:0;line-height:0"><img src="${c.imageUrl}" alt="${c.imageAlt ?? ''}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>` : ''),
  'three-points': ({ t, c }: Ctx) => `<tr><td class="px" style="padding:36px 30px 20px;background:${t.soft}">
${c.points.slice(0, 3).map((p) => `<table role="presentation" class="stack" align="left" width="173" cellpadding="0" cellspacing="0" style="width:173px"><tr><td style="padding:0 10px 18px">
<p style="margin:0 0 6px;font-family:${t.heading};font-size:17px;line-height:23px;font-weight:bold;color:${t.text}">${p.title}</p>
<p style="margin:0;font-size:14px;line-height:21px;color:${t.muted}">${p.text}</p>
</td></tr></table>`).join('\n')}
</td></tr>`,
  quote: ({ t, c }: Ctx) => `<tr><td class="px" align="center" style="padding:44px 56px;background:${t.soft};text-align:center">
<p style="margin:0 0 14px;font-family:${SERIF};font-size:22px;line-height:32px;font-style:italic;color:${t.text}">“${c.quote}”</p>
<p style="margin:0;${small(t)}">${c.quoteBy}</p>
</td></tr>`,
  divider: ({ t }: Ctx) => `<tr><td class="px" style="padding:12px 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;font-size:0;line-height:0;background:${t.line}">&nbsp;</td></tr></table></td></tr>`,

  // Endings
  'cta-center': ({ t, c }: Ctx) => `<tr><td class="px" align="center" style="padding:28px 40px 40px"><table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td>${button(t, c.cta, c.ctaUrl)}</td></tr></table></td></tr>`,
  'cta-band': ({ t, c }: Ctx) => `<tr><td class="px" align="center" style="padding:48px 40px;background:${t.accent};text-align:center">
<h2 style="margin:0 0 10px;font-family:${t.heading};font-size:28px;line-height:34px;font-weight:${t.headingWeight};color:${t.onAccent}">${c.contactTitle}</h2>
<p style="margin:0 0 24px;font-size:16px;line-height:25px;color:${t.onAccent}">${c.contactText}</p>
<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td>${button(t, c.cta, c.ctaUrl, t.onAccent, t.accent)}</td></tr></table>
</td></tr>`,
  'contact-card': ({ t, c }: Ctx) => `<tr><td class="px" style="padding:36px 40px;background:${t.soft}">
<h2 style="margin:0 0 8px;${headingCss(t, 24, 30)}">${c.contactTitle}</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${t.muted}">${c.contactText}</p>
<p style="margin:0;font-size:16px;line-height:26px;font-weight:bold"><a href="tel:{{agency.phone}}" style="color:${t.text};text-decoration:none">{{agency.phone}}</a><br><a href="mailto:{{agency.email}}" style="color:${t.text};text-decoration:none">{{agency.email}}</a></p>
</td></tr>`,
  'contact-agency': ({ t, c }: Ctx) => `<tr><td class="px" align="center" style="padding:40px;border-top:1px solid ${t.line};text-align:center">
${logo(t.text, t)}
<p style="margin:16px 0 4px;font-family:${t.heading};font-size:20px;line-height:26px;color:${t.text}">${c.contactTitle}</p>
<p style="margin:0;font-size:15px;line-height:24px;color:${t.muted}"><a href="tel:{{agency.phone}}" style="color:${t.text};text-decoration:none">{{agency.phone}}</a> · <a href="mailto:{{agency.email}}" style="color:${t.text};text-decoration:none">{{agency.email}}</a></p>
</td></tr>`,
  footer: ({ t, c }: Ctx) => `<tr><td class="px" align="center" style="padding:26px 40px 34px;text-align:center;font-size:12px;line-height:19px;color:${t.muted}">
{{agency.name}} · <a href="{{agency.website}}" style="color:${t.muted}">{{agency.website}}</a><br>
${c.footerText} <a href="{{unsubscribe_link}}" style="color:${t.muted}">${c.unsubscribe}</a>
</td></tr>`,
} as const;

function gridCard(t: Theme, view: string): string {
  return `<table role="presentation" class="stack" align="left" width="260" cellpadding="0" cellspacing="0" style="width:260px"><tr><td style="padding:0 10px 28px">
${photo(250, t.radius)}
<p style="margin:12px 0 4px;${small(t)}">{{property.location}}</p>
<p style="margin:0 0 4px;font-family:${t.heading};font-size:17px;line-height:23px;font-weight:bold;color:${t.text}">{{property.title}}</p>
<p style="margin:0 0 4px;font-size:13px;line-height:19px;color:${t.muted}">{{property.facts}}</p>
<p style="margin:0 0 10px;font-size:18px;line-height:24px;font-weight:bold;color:${t.text}">{{property.price}}</p>
<a href="{{property.url}}" style="font-size:14px;line-height:20px;font-weight:bold;color:${t.accent === '{{agency.color}}' ? t.text : t.accent}">${view} →</a>
</td></tr></table>`;
}

function rowCard(t: Theme, view: string): string {
  return `<tr><td style="padding:0 0 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${t.line}"><tr><td style="padding:0 0 18px">
<table role="presentation" class="stack" align="left" width="190" cellpadding="0" cellspacing="0" style="width:190px"><tr><td style="padding:0 16px 10px 0">${photo(174, t.radius)}</td></tr></table>
<table role="presentation" class="stack" align="left" width="330" cellpadding="0" cellspacing="0" style="width:330px"><tr><td>
${listingLabel(t)}
<p style="margin:0 0 4px;font-family:${t.heading};font-size:18px;line-height:24px;font-weight:bold;color:${t.text}">{{property.title}}</p>
<p style="margin:0 0 4px;font-size:14px;line-height:20px;color:${t.muted}">{{property.facts}}</p>
<p style="margin:0 0 6px;font-size:17px;line-height:23px;font-weight:bold;color:${t.text}">{{property.price}}</p>
<a href="{{property.url}}" style="font-size:14px;line-height:20px;font-weight:bold;color:${t.accent === '{{agency.color}}' ? t.text : t.accent}">${view} →</a>
</td></tr></table>
</td></tr></table></td></tr>`;
}

export type SectionName = keyof typeof SECTIONS;
export const SECTION_NAMES = Object.keys(SECTIONS) as SectionName[];

// What the AI reads to choose sections.
export const SECTION_GUIDE = `Headers: logo-center, logo-left, logo-brand (logo on brand colour), logo-phone (logo + phone).
Openings: hero-text, hero-center, hero-band (headline on brand colour), hero-photo (first listing's photo edge to edge with a price band; follow it with lead-details).
Listings: lead-feature (first listing large), lead-details (first listing's words, after hero-photo), lead-split (first listing, photo beside text), grid-others / rows-others (the listings after the first, with a heading), grid-all, stack-all, rows-all (every listing). Use one "all" section, or lead + others, never both.
Content: text-block, image-banner (needs imageUrl), three-points, quote (only with a real quote from the client), divider.
Endings: cta-center, cta-band, contact-card, contact-agency, footer (always last).`;

// Words from a request go in escaped; {{placeholders}} stay usable. Links must be http(s) or a placeholder.
function cleanCopy(copy: SectionCopy | undefined): Ctx['c'] {
  const c = { ...DEFAULTS } as Ctx['c'];
  const raw = (copy ?? {}) as Record<string, unknown>;
  for (const key of ['kicker', 'headline', 'intro', 'body', 'cta', 'view', 'moreTitle', 'contactTitle', 'contactText', 'quote', 'quoteBy', 'footerText', 'unsubscribe'] as const) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) c[key] = clean(v.trim().slice(0, 600));
  }
  const url = typeof raw.ctaUrl === 'string' ? raw.ctaUrl.trim() : '';
  if (/^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[^\s"'<>]+|\{\{\s*agency\.(website|email)\s*\}\})$/i.test(url)) c.ctaUrl = clean(url);
  const image = typeof raw.imageUrl === 'string' ? raw.imageUrl.trim() : '';
  if (/^https?:\/\/[^\s"'<>]+$/i.test(image)) c.imageUrl = clean(image);
  if (typeof raw.imageAlt === 'string') c.imageAlt = clean(raw.imageAlt.trim().slice(0, 200));
  if (Array.isArray(raw.points)) {
    const points = raw.points
      .filter((p): p is { title: string; text: string } => !!p && typeof (p as { title?: unknown }).title === 'string' && typeof (p as { text?: unknown }).text === 'string')
      .slice(0, 3)
      .map((p) => ({ title: clean(p.title.slice(0, 80)), text: clean(p.text.slice(0, 200)) }));
    if (points.length === 3) c.points = points;
  }
  return c;
}

const shell = (t: Theme, inner: string, lang: string) => `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{agency.name}}</title>
<style>
@media (max-width:620px){.container{width:100%!important}.stack{display:block!important;width:100%!important;max-width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:30px!important;line-height:36px!important}.fill{max-width:100%!important}}
</style></head>
<body style="margin:0;padding:0;background:${t.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${t.card};font-family:${t.font};color:${t.text}">
${inner}
</table>
</td></tr></table>
</body></html>`;

export interface Composition {
  theme: ThemeName;
  sections: SectionName[];
  copy?: SectionCopy;
  lang?: string;
}

export function composeDesign({ theme, sections, copy, lang }: Composition): string {
  const t = THEMES[theme];
  const c = cleanCopy(copy);
  const names: SectionName[] = sections.includes('footer') ? sections.filter((s) => s !== 'footer') : [...sections];
  names.push('footer'); // always last, and every design has one
  const inner = names.map((s) => SECTIONS[s]({ t, c })).filter(Boolean).join('\n');
  return shell(t, inner, /^[a-z]{2}$/.test(lang ?? '') ? (lang as string) : 'en');
}

// A section list from an AI: known names only, no repeats. Listings shown twice
// would make "all" and lead/others sections repeat the same homes.
export function validSections(raw: unknown): { sections: SectionName[]; problem?: string } {
  if (!Array.isArray(raw) || !raw.length) return { sections: [], problem: 'sections must be a list of section names' };
  const unknown = raw.filter((s) => !SECTION_NAMES.includes(s as SectionName));
  if (unknown.length) return { sections: [], problem: `unknown sections: ${unknown.join(', ')}. Choose from ${SECTION_NAMES.join(', ')}` };
  const sections = [...new Set(raw as SectionName[])];
  const all = sections.filter((s) => /-all$/.test(s)).length;
  const lead = sections.filter((s) => /^(lead-|hero-photo)/.test(s) || /-others$/.test(s)).length;
  if (all > 1 || (all && lead)) return { sections: [], problem: 'use one "-all" listing section, or lead and "-others" sections, not both' };
  return { sections };
}
