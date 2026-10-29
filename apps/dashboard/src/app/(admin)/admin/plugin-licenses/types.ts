// Super admin -> Plugin licences (SPM AI Translator for Polylang). Shapes from
// api/src/modules/plugin-license/plugin-license-admin.service.ts.

export type LicenseStatus = 'active' | 'expired' | 'revoked';
export type StatusFilter = 'all' | 'active' | 'expiring' | 'expired' | 'revoked';

export interface PluginPlan {
  id: string;
  label: string;
  sites: number;
  words: number | null;
}

export interface LicenseRow {
  id: number;
  plan: string;
  planLabel: string;
  status: LicenseStatus;
  source: 'manual' | 'stripe';
  email: string;
  customerName: string | null;
  notes: string | null;
  last4: string;
  sitesAllowed: number;
  sitesUsed: number;
  lastSeenAt: string | null;
  expiresAt: string | null;
  credits: { words_allowed: number; words_used: number; resets_at: string } | null;
  createdAt: string;
}

export interface LicenseSite {
  id: number;
  siteUrl: string;
  pluginVersion: string | null;
  lastSeenAt: string | null;
  activatedAt: string;
}

export interface LicenseHistoryItem {
  id: number;
  event: string;
  by: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface LicenseDetail {
  license: LicenseRow;
  sites: LicenseSite[];
  history: LicenseHistoryItem[];
  key?: string;
  emailed?: boolean;
}

export interface LicenseSummary {
  active: number;
  expiring: number;
  expired: number;
  revoked: number;
  sites: number;
}

export const unwrap = <T,>(res: any): T => (res && typeof res === 'object' && 'data' in res ? res.data : res) as T;

export const daysUntil = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);
