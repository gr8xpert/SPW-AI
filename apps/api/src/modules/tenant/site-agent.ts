import type { TenantSettings } from '@spm/shared';

// The agent the website shows on property pages (Settings → Widget → Website
// agent): the client's own public contact details, cleaned. Null when no name.
export function publicSiteAgent(value: TenantSettings['siteAgent']): Record<string, string> | null {
  if (!value || typeof value !== 'object') return null;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = text(value.name, 120);
  if (!name) return null;
  const out: Record<string, string> = { name };
  const title = text(value.title, 120);
  if (title) out.title = title;
  const email = text(value.email, 200);
  if (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) out.email = email;
  for (const key of ['phone', 'whatsapp'] as const) {
    const phone = text(value[key], 40);
    if (/^\+?[\d\s().-]{6,40}$/.test(phone)) out[key] = phone;
  }
  const photo = text(value.photo, 1000);
  if (/^https?:\/\/[^\s"'<>]+$/i.test(photo)) out.photo = photo;
  return out;
}
