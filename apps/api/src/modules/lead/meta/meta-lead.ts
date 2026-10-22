// Facebook / Instagram lead forms (milestone K): a Graph API lead → what the
// buyer intake needs. Pure.
//
// A lead looks like:
//   { id, created_time: '2026-10-22T08:15:00+0000', platform: 'fb' | 'ig',
//     form_id, ad_name, campaign_name,
//     field_data: [{ name: 'email', values: ['ann@x.com'] }, { name: 'full_name', values: ['Ann Lee'] }, …] }
// Standard question names: email, full_name, first_name, last_name,
// phone_number; anything else is a custom question (its name is the label
// the agency typed, lowercased with underscores).

export interface GraphLead {
  id: string;
  created_time?: string;
  platform?: string;
  form_id?: string;
  ad_name?: string;
  campaign_name?: string;
  field_data?: { name?: string; values?: unknown[] }[];
}

export interface MetaIntake {
  leadgenId: string;
  email: string;
  name?: string;
  phone?: string;
  source: 'facebook' | 'instagram';
  createdAt: Date | null;
  // Every answer, for the activity: "Question: answer" lines.
  message: string;
  answers: { question: string; answer: string }[];
}

const STANDARD = new Set(['email', 'full_name', 'first_name', 'last_name', 'phone_number', 'phone']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v: unknown, max = 500) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function questionLabel(name: string): string {
  const s = clean(name, 120).replace(/[_]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Graph writes '2026-10-22T08:15:00+0000' (no colon in the offset).
export function graphTime(t: string | undefined): Date | null {
  if (!t) return null;
  const d = new Date(t.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(+d) ? null : d;
}

// null = no usable email (a buyer is one per email).
export function toIntake(lead: GraphLead, formName?: string): MetaIntake | null {
  if (!lead || typeof lead.id !== 'string' || !/^\d{1,40}$/.test(lead.id)) return null;
  const fields = new Map<string, string>();
  const answers: { question: string; answer: string }[] = [];
  for (const f of lead.field_data ?? []) {
    const key = clean(f?.name, 120).toLowerCase();
    const value = (Array.isArray(f?.values) ? f.values : []).map((v) => clean(v)).filter(Boolean).join(', ');
    if (!key || !value) continue;
    if (STANDARD.has(key)) fields.set(key, value);
    else answers.push({ question: questionLabel(key), answer: value });
  }
  const email = (fields.get('email') ?? '').toLowerCase();
  if (!EMAIL.test(email) || email.length > 255) return null;
  const name = fields.get('full_name') || [fields.get('first_name'), fields.get('last_name')].filter(Boolean).join(' ') || undefined;
  const phone = (fields.get('phone_number') || fields.get('phone'))?.slice(0, 50);
  const source = String(lead.platform ?? '').toLowerCase() === 'ig' ? 'instagram' : 'facebook';
  const head = [
    `${source === 'instagram' ? 'Instagram' : 'Facebook'} lead form${formName ? `: ${clean(formName, 200)}` : ''}`,
    lead.campaign_name ? `Campaign: ${clean(lead.campaign_name, 200)}` : '',
    lead.ad_name ? `Ad: ${clean(lead.ad_name, 200)}` : '',
  ].filter(Boolean);
  const message = [...head, ...answers.map((a) => `${a.question}: ${a.answer}`)].join('\n').slice(0, 5000);
  return { leadgenId: lead.id, email, name: name ? name.slice(0, 200) : undefined, phone: phone || undefined, source, createdAt: graphTime(lead.created_time), message, answers };
}

// Only digits: a Page id is put into the Graph URL path.
export function validPageId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{5,30}$/.test(id);
}
