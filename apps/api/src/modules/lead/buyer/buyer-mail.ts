import { escapeHtml } from '../../../common/security/escape-html';
import { frame, quote, titleOf, type FormSender } from '../form-mail.service';
import { priceText } from '../../property/price-text';
import { propertyUrlSegment } from '../../property/property-url';
import type { BuyerPropertyCard } from './buyer-property-card';

// The email that sends a buyer their selected properties, built from the
// client's labels so it reads in the buyer's language. Pure: the service
// adds the tenant, labels and recipients.

export interface BuyerMailInput {
  from: FormSender;
  labels: Record<string, string>;
  lang: string;
  // Buyer's first + last name; null = "Hello,".
  buyerName: string | null;
  agent: { name: string | null; email: string | null } | null;
  message?: string;
  properties: BuyerPropertyCard[];
  urlPatterns: Record<string, string>;
  slugFormat: unknown;
  // Set on the agent's copy: "Copy of the selection for {name}".
  copyFor?: string;
  // The buyer's copy only: an open pixel, and property links that go
  // through the signed click redirect.
  tracking?: { pixelUrl: string; link: (propertyId: number) => string; unsubscribeUrl?: string };
  // The buyer's personal page ("View my properties"); buyer's copy only.
  pageUrl?: string;
  // An alert email (milestone H): new-listing wording, and the old price of
  // each listing that dropped its price (by property id).
  alert?: { drops: Record<number, number> };
}

export interface BuyerMail {
  subject: string;
  html: string;
  text: string;
}

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

function nameIn(name: unknown, lang: string): string {
  return titleOf(name, lang);
}

// The property's page on the client's site, from the pattern for this
// language (else the default one). No pattern = no link.
export function propertyLink(
  p: Pick<BuyerPropertyCard, 'reference' | 'title' | 'slug' | 'location' | 'propertyType'>,
  lang: string,
  patterns: Record<string, string>,
  slugFormat: unknown,
): string | null {
  const pattern = patterns[lang] || patterns.default;
  if (!pattern) return null;
  const segment = propertyUrlSegment(
    {
      reference: p.reference,
      title: titleOf(p.title, lang),
      slug: p.slug,
      location: p.location ? { name: nameIn(p.location.name, lang) } : null,
      propertyType: p.propertyType ? { name: nameIn(p.propertyType.name, lang) } : null,
    },
    slugFormat,
  );
  const url = pattern
    .replace(/\{lang\}/g, encodeURIComponent(lang))
    .replace(/\{segment\}/g, encodeURI(segment))
    .replace(/\{ref\}/g, encodeURIComponent(p.reference));
  return /^https?:\/\/\S+$/i.test(url) ? url : null;
}

export function buildBuyerEmail(input: BuyerMailInput): BuyerMail {
  const { from, labels, lang } = input;
  const t = (key: string, fallback: string) => labels[key] || fallback;
  const cards = input.properties.map((p) => {
    const facts = [
      p.bedrooms ? `${rangeText(p.bedrooms, p.bedroomsTo)} ${t('buyer_email_beds', 'bed')}` : '',
      p.bathrooms ? `${rangeText(p.bathrooms, p.bathroomsTo)} ${t('buyer_email_baths', 'bath')}` : '',
      p.buildSize ? `${rangeText(p.buildSize, p.buildSizeTo)} m²` : '',
    ].filter(Boolean).join(' · ');
    return {
      title: titleOf(p.title, lang) || p.reference,
      reference: p.reference,
      place: p.location ? nameIn(p.location.name, lang) : '',
      price: priceText(p, lang, { onRequest: labels.price_on_request }),
      drop: input.alert?.drops[p.id]
        ? fill(t('buyer_alert_price_drop', 'Price reduced from {old} to {new}'), {
            old: priceText({ ...p, price: input.alert.drops[p.id], priceTo: null }, lang),
            new: priceText({ ...p, priceTo: null }, lang),
          })
        : '',
      facts,
      image: p.image && /^https:\/\//i.test(p.image) ? p.image : undefined,
      url: trackedUrl(propertyLink(p, lang, input.urlPatterns, input.slugFormat), p.id, input.tracking),
      tour: p.virtualTourUrl && /^https?:\/\//i.test(p.virtualTourUrl) ? p.virtualTourUrl : undefined,
    };
  });

  const alert = !!input.alert;
  const subject = alert
    ? fill(t('buyer_alert_subject', '{company}: new properties for your search'), { company: from.name, n: cards.length })
    : fill(t('buyer_email_subject', '{company}: properties selected for you'), { company: from.name, n: cards.length });
  const heading = alert ? t('buyer_alert_heading', 'New properties for your search') : t('buyer_email_heading', 'Properties selected for you');
  const greeting = input.buyerName
    ? fill(t('buyer_email_greeting', 'Dear {name},'), { name: input.buyerName })
    : t('buyer_email_greeting_anon', 'Hello,');
  const intro = alert
    ? t('buyer_alert_intro', 'These properties are new or have a lower price, and they match what you are looking for.')
    : t('buyer_email_intro', 'We have selected these properties for you. Click a property to see all photos and details.');
  const view = t('buyer_email_view', 'View property');
  const tourLabel = t('buyer_email_virtual_tour', 'Virtual tour');
  const ref = t('buyer_email_ref', 'Ref.');
  const closing = t('buyer_email_closing', 'Kind regards,');
  const copyLine = input.copyFor ? fill(t('buyer_email_agent_copy', 'Copy of the selection for {name}'), { name: input.copyFor }) : '';
  const signer = [input.agent?.name, from.name].filter(Boolean) as string[];
  const pageUrl = input.pageUrl && /^https?:\/\/\S+$/i.test(input.pageUrl) ? input.pageUrl : null;
  // Every buyer copy can be stopped with one click (GDPR, milestone J).
  const unsubscribeUrl = input.tracking?.unsubscribeUrl && /^https?:\/\/\S+$/i.test(input.tracking.unsubscribeUrl) ? input.tracking.unsubscribeUrl : null;
  const unsubscribeText = t('buyer_email_unsubscribe_text', "Don't want these emails any more?");
  const unsubscribeLink = t('buyer_email_unsubscribe', 'Unsubscribe');
  const pageIntro = t('buyer_email_page_intro', 'Tell us what you think of each property on your personal page:');
  const pageButton = t('buyer_email_view_page', 'View my properties');
  const message = input.message?.trim();

  const list = cards.map((c) => `
      <tr><td style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          ${c.image ? `<td width="160" valign="top" style="padding-right:14px;">${c.url ? `<a href="${escapeHtml(c.url)}">` : ''}<img src="${escapeHtml(c.image)}" width="160" alt="" style="display:block;width:160px;height:auto;border-radius:6px;"/>${c.url ? '</a>' : ''}</td>` : ''}
          <td valign="top">
            <p style="margin:0 0 4px;font-weight:600;">${escapeHtml(c.title)}</p>
            <p style="margin:0 0 4px;color:#64748b;font-size:13px;">${escapeHtml(ref)} ${escapeHtml(c.reference)}${c.place ? ` · ${escapeHtml(c.place)}` : ''}${c.facts ? ` · ${escapeHtml(c.facts)}` : ''}</p>
            <p style="margin:0 0 8px;font-weight:600;">${escapeHtml(c.price)}</p>
            ${c.drop ? `<p style="margin:-4px 0 8px;color:#15803d;font-size:13px;font-weight:600;">${escapeHtml(c.drop)}</p>` : ''}
            ${c.url ? `<a href="${escapeHtml(c.url)}" style="color:${from.color};font-weight:600;">${escapeHtml(view)}</a>` : ''}
            ${c.tour ? `${c.url ? ' &nbsp;·&nbsp; ' : ''}<a href="${escapeHtml(c.tour)}" style="color:${from.color};">${escapeHtml(tourLabel)}</a>` : ''}
          </td>
        </tr></table>
      </td></tr>`).join('');

  const html = frame(from, heading, `
      ${copyLine ? `<p style="margin:0 0 16px;padding:8px 12px;background:#fef9c3;border-radius:6px;font-size:13px;">${escapeHtml(copyLine)}</p>` : ''}
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(intro)}</p>
      ${message ? quote(message) : ''}
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${list}</table>
      ${pageUrl ? `<p style="margin:20px 0 8px;">${escapeHtml(pageIntro)}</p>
      <p style="margin:0 0 8px;"><a href="${escapeHtml(pageUrl)}" style="display:inline-block;background:${from.color};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;">${escapeHtml(pageButton)}</a></p>` : ''}
      <p style="margin-top:20px;">${escapeHtml(closing)}<br/>${signer.map(escapeHtml).join('<br/>')}</p>
      ${unsubscribeUrl ? `<p style="margin-top:24px;font-size:12px;color:#64748b;">${escapeHtml(unsubscribeText)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b;">${escapeHtml(unsubscribeLink)}</a></p>` : ''}
      ${input.tracking ? `<img src="${escapeHtml(input.tracking.pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;"/>` : ''}`);

  const text = [
    ...(copyLine ? [copyLine, ''] : []),
    greeting,
    '',
    intro,
    ...(message ? ['', message] : []),
    '',
    ...cards.map((c) =>
      [c.title, `${ref} ${c.reference}${c.place ? ` · ${c.place}` : ''}${c.facts ? ` · ${c.facts}` : ''}`, c.price, c.drop, c.url, c.tour ? `${tourLabel}: ${c.tour}` : '']
        .filter(Boolean)
        .join('\n'),
    ).join('\n\n').split('\n'),
    ...(pageUrl ? ['', pageIntro, `${pageButton}: ${pageUrl}`] : []),
    '',
    closing,
    ...signer,
    ...(from.website ? [from.website] : []),
    ...(unsubscribeUrl ? ['', `${unsubscribeText} ${unsubscribeLink}: ${unsubscribeUrl}`] : []),
  ].join('\n');

  return { subject, html, text };
}

function trackedUrl(url: string | null, propertyId: number, tracking: BuyerMailInput['tracking']): string | undefined {
  if (!url) return undefined;
  return tracking ? tracking.link(propertyId) : url;
}

function rangeText(from: number, to: number | null): string {
  return to && to > from ? `${from}–${to}` : String(from);
}
