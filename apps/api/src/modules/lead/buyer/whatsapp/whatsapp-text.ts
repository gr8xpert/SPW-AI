// WhatsApp click-to-chat (2026-10-24). The agent's own WhatsApp opens with
// the text typed in; the agent presses Send. Pure helpers: the numbers to
// offer, the wa.me link and the message layout.

export type WhatsAppKind = 'properties' | 'enquiry' | 'viewing' | 'follow_up';
export const WHATSAPP_KINDS: WhatsAppKind[] = ['properties', 'enquiry', 'viewing', 'follow_up'];

export interface WhatsAppPhone {
  label: 'mobile' | 'phone';
  number: string;
  digits: string;
  // Has a country code (+ or 00). wa.me needs one; without it WhatsApp
  // can't find the person, so the dialog warns.
  international: boolean;
}

export interface WhatsAppPropertyLine {
  title: string;
  price: string;
  link: string | null;
}

const MAX_TEXT = 4000;

export function cleanPhone(raw: string | null | undefined): { digits: string; international: boolean } | null {
  const s = String(raw ?? '').trim();
  let digits = s.replace(/\D/g, '');
  let international = s.startsWith('+');
  if (!international && digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  return digits.length >= 7 ? { digits, international } : null;
}

export function phonesOf(p: { mobile?: string | null; phone?: string | null }): WhatsAppPhone[] {
  const out: WhatsAppPhone[] = [];
  for (const label of ['mobile', 'phone'] as const) {
    const number = p[label]?.trim();
    const clean = cleanPhone(number);
    if (number && clean && !out.some((o) => o.digits === clean.digits)) out.push({ label, number, ...clean });
  }
  return out;
}

export function waUrl(digits: string, text: string): string {
  return `https://wa.me/${digits.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export interface WhatsAppAgent {
  name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  // Already the address to show (public email, else a real login email).
  email?: string | null;
}

// The agent's name, then a wa.me link (one tap opens a chat with the agent)
// and their email (WhatsApp turns it into a mail link). A number without a
// country code can't make a wa.me link, so it's shown as typed. No agent
// name: the company name.
export function agentSignature(agent: WhatsAppAgent | null, company: string | null): string {
  const lines: string[] = [agent?.name?.trim() || company?.trim() || ''];
  const number = agent?.whatsapp?.trim() || agent?.phone?.trim() || '';
  const clean = cleanPhone(number);
  if (clean) lines.push(`📱 ${clean.international ? `https://wa.me/${clean.digits}` : number}`);
  const email = agent?.email?.trim();
  if (email) lines.push(`✉️ ${email}`);
  return lines.filter(Boolean).join('\n');
}

// Message, then a block per property (*title* · price, link), extra lines,
// the agent's signature. A long message is cut, never a link.
export function buildWhatsAppText(i: {
  message: string;
  properties?: WhatsAppPropertyLine[];
  extraLines?: string[];
  signature?: string | null;
}): string {
  const tidy = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const blocks = (i.properties ?? []).map((p) => [`*${p.title.trim()}* · ${p.price.trim()}`, p.link].filter(Boolean).join('\n'));
  const extra = (i.extraLines ?? []).map(tidy).filter(Boolean).join('\n');
  const rest = [...blocks, extra, tidy(i.signature ?? '')].filter(Boolean).join('\n\n');
  let message = tidy(i.message);
  const room = MAX_TEXT - (rest ? rest.length + 2 : 0);
  if (message.length > room) message = `${message.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
  return [message, rest].filter(Boolean).join('\n\n');
}
