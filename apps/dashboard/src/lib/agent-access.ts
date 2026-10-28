// Agents (role 'user') only work New Leads, Contacts and Email Campaigns,
// plus their own profile. Every other dashboard page is hidden from the
// menu and sends them back to their day.
export const AGENT_ROLE = 'user';
export const AGENT_HOME = '/dashboard/buyers/home';

const AGENT_PATHS = ['/dashboard/leads', '/dashboard/buyers', '/dashboard/campaigns', '/dashboard/profile'];

export function isAgentPath(pathname: string): boolean {
  return AGENT_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
