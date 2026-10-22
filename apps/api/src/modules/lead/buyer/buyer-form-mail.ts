import type { BuyerWishlist } from '@spm/shared';
import { escapeHtml } from '../../../common/security/escape-html';
import { frame, quote, type FormSender } from '../form-mail.service';
import { fill } from './buyer-mail';

// The two emails the website wishlist form sends: a confirmation to the
// visitor in the page language (client labels), and a notice to the agent.
// Pure: the service brings the names, labels and recipients.

export interface SummaryRow {
  label: string;
  value: string;
}

// Names of the wishlist's ids in one language.
export interface WishlistNames {
  locations: Map<number, string>;
  types: Map<number, string>;
  features: Map<number, string>;
}

const LISTING_LABELS: Record<string, [string, string]> = {
  sale: ['listing_type_sale', 'For Sale'],
  rent: ['listing_type_rent', 'For Rent'],
  holiday_rent: ['listing_type_holiday', 'Holiday Rental'],
  development: ['listing_type_development', 'New Development'],
};

function money(n: number, currency: string | undefined, lang: string): string {
  try {
    return new Intl.NumberFormat(lang || 'en', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString('en')} ${currency || ''}`.trim();
  }
}

// The wishlist in words, one row per thing asked for, in the label language.
export function wishlistSummary(w: BuyerWishlist | null, names: WishlistNames, labels: Record<string, string>, lang: string): SummaryRow[] {
  if (!w) return [];
  const t = (key: string, fallback: string) => labels[key] || fallback;
  const rows: SummaryRow[] = [];
  const list = (ids: number[] | undefined, map: Map<number, string>) => (ids ?? []).map((id) => map.get(id)).filter(Boolean).join(', ');
  if (w.listingTypes?.length) {
    rows.push({ label: t('wishlist_form_listing_type', 'I am looking to'), value: w.listingTypes.map((l) => t(...(LISTING_LABELS[l] ?? [l, l]))).join(', ') });
  }
  const places = list(w.locationIds, names.locations);
  if (places) rows.push({ label: t('wishlist_form_locations', 'Locations'), value: places });
  const types = list(w.propertyTypeIds, names.types);
  if (types) rows.push({ label: t('wishlist_form_types', 'Property types'), value: types });
  if (w.minBedrooms) rows.push({ label: t('wishlist_form_bedrooms', 'Bedrooms (min.)'), value: `${w.minBedrooms}+` });
  if (w.minBathrooms) rows.push({ label: t('wishlist_form_bathrooms', 'Bathrooms (min.)'), value: `${w.minBathrooms}+` });
  if (w.budgetMin) rows.push({ label: t('wishlist_form_budget_min', 'Budget from'), value: money(w.budgetMin, w.currency, lang) });
  if (w.budgetMax) rows.push({ label: t('wishlist_form_budget_max', 'Budget up to'), value: money(w.budgetMax, w.currency, lang) });
  if (w.minBuildSize) rows.push({ label: t('wishlist_form_build_size', 'Build size from (m²)'), value: `${w.minBuildSize} m²` });
  if (w.minPlotSize) rows.push({ label: t('wishlist_form_plot_size', 'Plot size from (m²)'), value: `${w.minPlotSize} m²` });
  const features = list(w.featureIds, names.features);
  if (features) rows.push({ label: t('wishlist_form_features', 'Features'), value: features });
  return rows;
}

function table(rows: SummaryRow[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 16px;font-size:14px;">${rows
    .map(
      (r) => `<tr><td valign="top" style="padding:6px 12px 6px 0;color:#64748b;width:40%;">${escapeHtml(r.label)}</td><td valign="top" style="padding:6px 0;">${escapeHtml(r.value)}</td></tr>`,
    )
    .join('')}</table>`;
}

export interface ConfirmationInput {
  from: FormSender;
  labels: Record<string, string>;
  name: string;
  summary: SummaryRow[];
}

export function buildWishlistConfirmation(input: ConfirmationInput): { subject: string; html: string; text: string } {
  const { from, labels } = input;
  const t = (key: string, fallback: string) => labels[key] || fallback;
  const subject = fill(t('wishlist_form_email_subject', '{company}: we have received your wishlist'), { company: from.name });
  const greeting = fill(t('wishlist_form_email_greeting', 'Dear {name},'), { name: input.name });
  const intro = t('wishlist_form_email_intro', 'We have received your wishlist. We will be in touch soon with properties that match.');
  const summaryLabel = t('wishlist_form_email_summary', 'What you are looking for');
  const closing = t('wishlist_form_email_closing', 'Kind regards,');
  const html = frame(from, t('wishlist_form_email_heading', 'Thank you for your wishlist'), `
      <p>${escapeHtml(greeting)}</p>
      <p>${escapeHtml(intro)}</p>
      ${input.summary.length ? `<p style="margin:16px 0 0;font-weight:600;">${escapeHtml(summaryLabel)}</p>${table(input.summary)}` : ''}
      <p style="margin-top:20px;">${escapeHtml(closing)}<br/>${escapeHtml(from.name)}</p>`);
  const text = [
    greeting,
    '',
    intro,
    ...(input.summary.length ? ['', summaryLabel, ...input.summary.map((r) => `${r.label}: ${r.value}`)] : []),
    '',
    closing,
    from.name,
    ...(from.website ? [from.website] : []),
  ].join('\n');
  return { subject, html, text };
}

export interface AgentNoticeInput {
  from: FormSender;
  name: string;
  email: string;
  phone?: string | null;
  preferredContact?: string | null;
  isNew: boolean;
  summary: SummaryRow[];
  answers: SummaryRow[];
  notes?: string | null;
  buyerUrl?: string;
}

// To the agent, in English like the dashboard. Replying answers the visitor.
export function buildAgentNotice(input: AgentNoticeInput): { subject: string; html: string; text: string } {
  const who = `${input.name} (${input.email})`;
  const subject = `${input.isNew ? 'New buyer' : 'Updated wishlist'}: ${input.name}`;
  const contact: SummaryRow[] = [
    { label: 'Email', value: input.email },
    ...(input.phone ? [{ label: 'Phone', value: input.phone }] : []),
    ...(input.preferredContact ? [{ label: 'Prefers', value: input.preferredContact }] : []),
  ];
  const html = frame(input.from, input.isNew ? 'New buyer from the wishlist form' : 'Wishlist updated from the website', `
      <p><strong>${escapeHtml(who)}</strong> filled in the wishlist form on the website.</p>
      ${table(contact)}
      ${input.summary.length ? `<p style="margin:16px 0 0;font-weight:600;">Wishlist</p>${table(input.summary)}` : ''}
      ${input.answers.length ? `<p style="margin:16px 0 0;font-weight:600;">About the buyer</p>${table(input.answers)}` : ''}
      ${input.notes?.trim() ? quote(input.notes.trim(), 'Notes') : ''}
      ${input.buyerUrl ? `<p><a href="${escapeHtml(input.buyerUrl)}" style="color:${input.from.color};font-weight:600;">Open the buyer</a></p>` : ''}
      <p style="color:#64748b;font-size:12px;">Reply to this email to answer ${escapeHtml(input.name)} directly.</p>`);
  const text = [
    `${who} filled in the wishlist form on the website.`,
    '',
    ...contact.map((r) => `${r.label}: ${r.value}`),
    ...(input.summary.length ? ['', 'Wishlist', ...input.summary.map((r) => `${r.label}: ${r.value}`)] : []),
    ...(input.answers.length ? ['', 'About the buyer', ...input.answers.map((r) => `${r.label}: ${r.value}`)] : []),
    ...(input.notes?.trim() ? ['', 'Notes', input.notes.trim()] : []),
    ...(input.buyerUrl ? ['', input.buyerUrl] : []),
  ].join('\n');
  return { subject, html, text };
}
