import { randomBytes } from 'crypto';
import { publicSiteAgent } from '../tenant/site-agent';

// Agents page rules, pure. A person is a users row: a dashboard login or not
// (canLogin), shown on the website or not (showOnWebsite), working buyers or
// not (worksBuyers). See docs/superpowers/specs/2026-10-22-agents-page-design.md.

export type AgentAccess = 'manager' | 'agent' | 'none';

export interface AgentCardSource {
  name?: string | null;
  title?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  publicEmail?: string | null;
  avatarUrl?: string | null;
  showOnWebsite?: boolean | null;
  isActive?: boolean | null;
}

// The website card of a person (the same shape as Settings → Website agent),
// or null when they are not on the website (or switched off). Never the
// login email.
export function agentCard(u: AgentCardSource | null | undefined): Record<string, string> | null {
  if (!u || !u.showOnWebsite || u.isActive === false) return null;
  return publicSiteAgent({
    name: u.name ?? '',
    title: u.title ?? '',
    phone: u.phone ?? '',
    whatsapp: u.whatsapp ?? '',
    email: u.publicEmail ?? '',
    photo: u.avatarUrl ?? '',
  });
}

const PLACEHOLDER = /^agent-\d+-[0-9a-f]{12}@no-login\.invalid$/;

// The login email of a person without a login: unique, never deliverable.
export function placeholderEmail(tenantId: number): string {
  return `agent-${tenantId}-${randomBytes(6).toString('hex')}@no-login.invalid`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && PLACEHOLDER.test(email);
}

export function accessOf(u: { role: string; canLogin?: boolean | null }): AgentAccess {
  if (u.canLogin === false) return 'none';
  return u.role === 'admin' ? 'manager' : 'agent';
}

// What an access choice means for the row. Working buyers needs a login;
// giving a login to someone who had none needs a real email and password.
export function planAccess(input: { access: AgentAccess; worksBuyers: boolean; hadLogin: boolean }): {
  role: 'admin' | 'user';
  canLogin: boolean;
  worksBuyers: boolean;
  needsLogin: boolean;
} {
  if (input.access === 'none') return { role: 'user', canLogin: false, worksBuyers: false, needsLogin: false };
  return {
    role: input.access === 'manager' ? 'admin' : 'user',
    canLogin: true,
    worksBuyers: input.worksBuyers,
    needsLogin: !input.hadLogin,
  };
}
