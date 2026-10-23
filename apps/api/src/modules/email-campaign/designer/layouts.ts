// Six hand-built starter designs. The AI starts from the closest one and the
// client can pick one in the editor. Email-safe: tables, inline styles, 600px,
// one @media block for phones. Colours and contact details come from
// placeholders so every client's version is their own.

export type LayoutName = 'luxury' | 'modern' | 'minimal' | 'newsletter' | 'new-listing' | 'open-house';

interface Theme { page: string; card: string; text: string; muted: string; accent: string; font: string; heading: string; radius: number }

const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const shell = (t: Theme, inner: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{agency.name}}</title>
<style>
@media (max-width:620px){.container{width:100%!important}.stack{display:block!important;width:100%!important;max-width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.h1{font-size:28px!important;line-height:34px!important}}
</style></head>
<body style="margin:0;padding:0;background:${t.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${t.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${t.card};border-radius:${t.radius}px;font-family:${t.font};color:${t.text}">
${inner}
</table>
</td></tr></table>
</body></html>`;

const header = (t: Theme, bg: string, align: 'left' | 'center') => `<tr><td class="px" align="${align}" style="padding:28px 40px;background:${bg}">
<a href="{{agency.website}}" style="text-decoration:none"><img src="{{agency.logo}}" alt="{{agency.name}}" height="40" style="height:40px;border:0;display:inline-block;color:${t.text};font-family:${t.heading};font-size:20px"></a>
</td></tr>`;

const hero = (t: Theme, kicker: string, title: string, text: string) => `<tr><td class="px" style="padding:40px 40px 16px">
<p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${t.accent}">${kicker}</p>
<h1 class="h1" style="margin:0 0 16px;font-family:${t.heading};font-size:34px;line-height:40px;font-weight:normal;color:${t.text}">${title}</h1>
<p style="margin:0;font-size:16px;line-height:26px;color:${t.muted}">${text}</p>
</td></tr>`;

const button = (t: Theme, label: string, href: string, color: string, textColor = '#ffffff') => `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:${t.radius}px;background:${color}">
<a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${t.font};font-size:15px;font-weight:bold;color:${textColor};text-decoration:none;border-radius:${t.radius}px">${label}</a>
</td></tr></table>`;

const stackCards = (t: Theme, buttonColor: string) => `<tr><td class="px" style="padding:16px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
{{#properties}}<tr><td style="padding:0 0 28px">
<a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:${t.radius}px"></a>
<p style="margin:14px 0 4px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${t.muted}">{{property.location}} · {{property.type}}</p>
<p style="margin:0 0 6px;font-family:${t.heading};font-size:21px;line-height:27px;color:${t.text}">{{property.title}}</p>
<p style="margin:0 0 12px;font-size:14px;color:${t.muted}">{{property.beds}} bedrooms · {{property.baths}} bathrooms · {{property.area}}</p>
<p style="margin:0 0 14px;font-size:20px;font-weight:bold;color:${t.accent}">{{property.price}}</p>
${button(t, 'View property', '{{property.url}}', buttonColor)}
</td></tr>{{/properties}}
</table></td></tr>`;

const gridCards = (t: Theme, buttonColor: string) => `<tr><td class="px" style="padding:16px 30px">
{{#properties}}<table role="presentation" class="stack" align="left" width="260" cellpadding="0" cellspacing="0" style="width:260px;margin:0 10px 24px">
<tr><td><a href="{{property.url}}"><img src="{{property.image}}" alt="{{property.title}}" width="260" style="display:block;width:100%;height:auto;border:0;border-radius:${t.radius}px"></a></td></tr>
<tr><td style="padding:12px 2px 0">
<p style="margin:0 0 4px;font-size:16px;font-weight:bold;line-height:21px;color:${t.text}">{{property.title}}</p>
<p style="margin:0 0 6px;font-size:13px;color:${t.muted}">{{property.location}} · {{property.beds}} bed · {{property.area}}</p>
<p style="margin:0 0 12px;font-size:17px;font-weight:bold;color:${t.accent}">{{property.price}}</p>
${button(t, 'View', '{{property.url}}', buttonColor)}
</td></tr></table>{{/properties}}
</td></tr>`;

const contact = (t: Theme, bg: string) => `<tr><td class="px" align="center" style="padding:32px 40px;background:${bg}">
<p style="margin:0 0 6px;font-family:${t.heading};font-size:20px;color:${t.text}">Talk to {{agency.name}}</p>
<p style="margin:0;font-size:15px;line-height:24px;color:${t.muted}"><a href="tel:{{agency.phone}}" style="color:${t.accent};text-decoration:none">{{agency.phone}}</a> · <a href="mailto:{{agency.email}}" style="color:${t.accent};text-decoration:none">{{agency.email}}</a></p>
</td></tr>`;

const footer = (t: Theme) => `<tr><td class="px" align="center" style="padding:24px 40px 32px;font-size:12px;line-height:18px;color:${t.muted}">
{{agency.name}} · <a href="{{agency.website}}" style="color:${t.muted}">{{agency.website}}</a><br>
You receive this email because you subscribed to our property updates. <a href="{{unsubscribe_link}}" style="color:${t.muted}">Unsubscribe</a>
</td></tr>`;

const luxury: Theme = { page: '#0b0b0b', card: '#141414', text: '#f5f1e8', muted: '#b9b2a3', accent: '#c9a227', font: SANS, heading: SERIF, radius: 0 };
const modern: Theme = { page: '#f1f5f9', card: '#ffffff', text: '#0f172a', muted: '#475569', accent: '{{agency.color}}', font: SANS, heading: SANS, radius: 8 };
const minimal: Theme = { page: '#ffffff', card: '#ffffff', text: '#111111', muted: '#666666', accent: '#111111', font: SANS, heading: SANS, radius: 0 };
const newsletter: Theme = { page: '#eef2f6', card: '#ffffff', text: '#1f2937', muted: '#4b5563', accent: '{{agency.color}}', font: SANS, heading: SERIF, radius: 6 };

export const LAYOUTS: { name: LayoutName; subject: string; html: string }[] = [
  {
    name: 'luxury',
    subject: 'Exceptional homes, selected for you',
    html: shell(luxury, [
      header(luxury, '#141414', 'center'),
      hero(luxury, 'Private collection', 'Exceptional homes, selected for you', 'Dear {{contact.first_name}}, a few residences we believe deserve your attention this month.'),
      stackCards(luxury, '#c9a227'),
      contact(luxury, '#1b1b1b'),
      footer(luxury),
    ].join('\n')),
  },
  {
    name: 'modern',
    subject: 'New properties for you, {{contact.first_name}}',
    html: shell(modern, [
      header(modern, '#ffffff', 'left'),
      hero(modern, 'New this week', 'Homes we think you will love', 'Hi {{contact.first_name}}, here are the latest listings matching what our clients ask for most.'),
      gridCards(modern, '{{agency.color}}'),
      `<tr><td class="px" align="center" style="padding:8px 40px 32px">${button(modern, 'See all properties', '{{agency.website}}', '{{agency.color}}')}</td></tr>`,
      contact(modern, '#f8fafc'),
      footer(modern),
    ].join('\n')),
  },
  {
    name: 'minimal',
    subject: 'A short selection for you',
    html: shell(minimal, [
      header(minimal, '#ffffff', 'left'),
      hero(minimal, '{{agency.name}}', 'A short selection', 'Hello {{contact.first_name}}, three homes worth a look.'),
      stackCards(minimal, '#111111'),
      footer(minimal),
    ].join('\n')),
  },
  {
    name: 'newsletter',
    subject: 'Our monthly property update',
    html: shell(newsletter, [
      header(newsletter, '{{agency.color}}', 'center'),
      hero(newsletter, 'Monthly update', 'What is happening in the market', 'Hi {{contact.first_name}}, a quick look at the month: what sold, what is new, and the homes our team recommends.'),
      `<tr><td class="px" style="padding:8px 40px 8px"><p style="margin:0;font-size:15px;line-height:24px;color:#4b5563">Write two or three short paragraphs here about prices, new developments or tips for buyers.</p></td></tr>`,
      gridCards(newsletter, '{{agency.color}}'),
      contact(newsletter, '#f3f4f6'),
      footer(newsletter),
    ].join('\n')),
  },
  {
    name: 'new-listing',
    subject: 'Just listed: {{agency.name}}',
    html: shell(modern, [
      header(modern, '#ffffff', 'center'),
      hero(modern, 'Just listed', 'Be the first to see it', 'Hi {{contact.first_name}}, this property has just come on the market.'),
      stackCards(modern, '{{agency.color}}'),
      contact(modern, '#f8fafc'),
      footer(modern),
    ].join('\n')),
  },
  {
    name: 'open-house',
    subject: 'You are invited: open house',
    html: shell(newsletter, [
      header(newsletter, '#ffffff', 'center'),
      hero(newsletter, 'Open house', 'Come and see it in person', 'Hi {{contact.first_name}}, join us for a viewing. No appointment needed.'),
      `<tr><td class="px" style="padding:8px 40px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;border-radius:6px"><tr><td style="padding:20px 24px;font-size:16px;line-height:26px;color:#1f2937"><b>Saturday, 10:00 – 14:00</b><br>Write the address here</td></tr></table></td></tr>`,
      stackCards(newsletter, '{{agency.color}}'),
      `<tr><td class="px" align="center" style="padding:0 40px 32px">${button(newsletter, 'Reply to book a time', 'mailto:{{agency.email}}', '{{agency.color}}')}</td></tr>`,
      footer(newsletter),
    ].join('\n')),
  },
];

export function layoutByName(name: string): { name: LayoutName; subject: string; html: string } | null {
  return LAYOUTS.find((l) => l.name === name) ?? null;
}
