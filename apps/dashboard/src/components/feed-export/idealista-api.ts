// Shapes + helpers shared by the idealista card's parts.

export interface IdealistaSettings {
  enabled: boolean;
  customerCode: string;
  country: 'Spain' | 'Portugal' | 'Italy';
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  addressVisibility: 'full' | 'street' | 'hidden';
  mode: 'own' | 'selected';
  propertyIds: number[];
  propertyUrlPattern: string;
}

export interface IdealistaTypeOption {
  value: string;
  label: string;
  category: string;
}

export interface IdealistaTypeRow {
  id: number;
  parentId: number | null;
  name: string;
  idealistaType: string | null;
  effectiveType: string | null;
  source: 'set' | 'parent' | 'guess' | null;
}

export interface IdealistaOverview {
  settings: IdealistaSettings;
  tenantSlug: string;
  exportKey: string | null;
  typeOptions: IdealistaTypeOption[];
  types: IdealistaTypeRow[];
}

export interface IdealistaCheck {
  included: number;
  skipped: Array<{ id: number; reference: string; reason: string }>;
  issues: Array<{ id: number; reference: string; issues: string[] }>;
  warnings: string[];
  sample: unknown;
}

export interface IdealistaListing {
  id: number;
  reference: string;
  agentReference: string | null;
  title: string;
  price: number | null;
  listingType: string;
  live: boolean;
}

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '');

// Responses come wrapped in { data } by the API's response interceptor.
export function unwrap<T>(res: unknown): T {
  const r = res as { data?: T } | null;
  return (r && typeof r === 'object' && 'data' in r ? r.data : res) as T;
}

export function errorText(err: unknown): string {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string };
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m || e?.message || 'Something went wrong';
}
