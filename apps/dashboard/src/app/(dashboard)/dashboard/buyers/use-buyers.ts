'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import type { NoteRule } from './use-buyer-ai';
import { dashboardLanguage } from '@/i18n/i18n-provider';

// Buyer Match data. Keys carry the signed-in user and impersonated tenant
// (useTenantQueryScope); every write invalidates everything under 'buyers'.
// queryFns call api.* inline: useApi reads the token at call time, so no
// stale-closure 401s (never wrap these in useCallback).

export type BuyerRole =
  | 'buyer' | 'registered' | 'seller' | 'professional' | 'estate_agent' | 'developer' | 'landlord' | 'tenant';
export const BUYER_ROLES: BuyerRole[] = [
  'buyer', 'registered', 'seller', 'professional', 'estate_agent', 'developer', 'landlord', 'tenant',
];
export type LeadSource = 'widget_inquiry' | 'phone' | 'email' | 'walkin' | 'referral' | 'website' | 'other' | 'facebook' | 'instagram' | 'calendly';
export const LEAD_SOURCES: LeadSource[] = ['widget_inquiry', 'website', 'phone', 'email', 'walkin', 'referral', 'facebook', 'instagram', 'calendly', 'other'];
export type PreferredContact = 'call' | 'email' | 'whatsapp';

export interface BuyerStage {
  id: number;
  name: Record<string, string>;
  color: string | null;
  sortOrder: number;
  kind: 'open' | 'won' | 'lost';
  // Chance (%) of buying from this stage; null = automatic (reports).
  probability?: number | null;
}

export interface BuyerAgent {
  id: number;
  name: string | null;
  email: string;
  role?: string;
  avatarUrl: string | null;
}

export interface RelatedContact {
  name: string;
  relation?: string;
  email?: string;
  phone?: string;
}

export interface BuyerListItem {
  id: number;
  role: BuyerRole;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  mobile: string | null;
  country: string | null;
  photoUrl: string | null;
  priority: number;
  source: LeadSource;
  stageId: number | null;
  stage: BuyerStage | null;
  assignedTo: number | null;
  assignedToUser: BuyerAgent | null;
  contact: { id: number; email: string } | null;
  lastActivityAt: string | null;
  // Set by the list (milestone I): likes, viewing requests, clicks, enquiries lately.
  hot?: boolean;
  // GDPR (milestone J).
  consentAt?: string | null;
  consentSource?: string | null;
  unsubscribedAt?: string | null;
  erasedAt?: string | null;
  createdAt: string;
}

export interface Buyer extends BuyerListItem {
  language: string | null;
  preferredContact: PreferredContact | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  state: string | null;
  idType: string | null;
  idNumber: string | null;
  lawyer: string | null;
  subStatus: string | null;
  dealValue: string | number | null;
  waitingReplyAt: string | null;
  referredBy: string | null;
  referralPercent: string | number | null;
  visitStart: string | null;
  visitEnd: string | null;
  notes: string | null;
  relatedContacts: RelatedContact[] | null;
  answers: Record<string, string[]> | null;
  wishlist: BuyerWishlist | null;
  agents: { id: number; userId: number; user: BuyerAgent | null }[];
  property: { id: number; reference: string; title: Record<string, string> | null } | null;
  mergedIds: number[];
  // Phase 3: rules read from the notes, and whether the notes changed since.
  noteRules?: NoteRule[] | null;
  rulesStale?: boolean;
}

export interface BuyerActivity {
  id: number | string;
  type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: number; name: string | null } | null;
  fromLeadId?: number;
}

export interface BuyerWishlist {
  listingTypes?: ('sale' | 'rent' | 'holiday_rent' | 'development')[];
  locationIds?: number[];
  propertyTypeIds?: number[];
  minBedrooms?: number;
  minBathrooms?: number;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  minBuildSize?: number;
  maxBuildSize?: number;
  minPlotSize?: number;
  maxPlotSize?: number;
  featureIds?: number[];
  sendMatchesTo?: 'buyer' | 'agent' | 'both';
  guessed?: boolean;
}

export interface BuyerMatchWeights {
  bedrooms: number;
  bathrooms: number;
  buildSize: number;
  plotSize: number;
  feature: number;
  featureOverrides: Record<string, number>;
}

export interface BuyerMatchSettings {
  assignMode: 'default' | 'round_robin';
  defaultAgentId: number | null;
  rotationAgentIds: number[];
  agentsSeeAll: boolean;
  staleDays: number;
  weights: BuyerMatchWeights;
  propertyUrlPatterns: Record<string, string>;
  buyerPageUrls: Record<string, string>;
  nearMiss: { enabled: boolean; budgetPercent: number; nearbyKm: number };
  alerts: { enabled: boolean; delivery: 'digest' | 'instant'; digestTime: string; priceDropPercent: number };
  viewingReminderMinutes: number;
  agentDigestTime: string;
  hotScore: number;
  firstContactHours: number;
  reportQuestions: string[];
}

export interface BuyerListParams {
  q?: string;
  role?: string;
  agentId?: string;
  stageId?: string;
  answer?: string;
  priority?: string;
  source?: string;
  stale?: string;
  hot?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
}

// Single objects come back as { data }, lists as { data: [], total, … }.
export function one<T>(res: unknown): T {
  const r = res as { data?: T } | null;
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
}

export const buyerKeys = {
  all: ['buyers'] as const,
  list: (scope: readonly unknown[], params: BuyerListParams) => ['buyers', 'list', ...scope, params] as const,
  detail: (scope: readonly unknown[], id: number) => ['buyers', 'detail', ...scope, id] as const,
  activities: (scope: readonly unknown[], id: number) => ['buyers', 'activities', ...scope, id] as const,
  stages: (scope: readonly unknown[]) => ['buyers', 'stages', ...scope] as const,
  agents: (scope: readonly unknown[]) => ['buyers', 'agents', ...scope] as const,
  settings: (scope: readonly unknown[]) => ['buyers', 'settings', ...scope] as const,
  languages: (scope: readonly unknown[]) => ['buyers', 'languages', ...scope] as const,
};

function toQuery(params: BuyerListParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function useBuyers(params: BuyerListParams) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: buyerKeys.list(scope, params),
    queryFn: async () => {
      const res = (await api.get(`/api/dashboard/buyers${toQuery(params)}`)) as {
        data: BuyerListItem[];
        total: number;
        page: number;
        limit: number;
      };
      return { data: res?.data ?? [], total: res?.total ?? 0, page: res?.page ?? 1, limit: res?.limit ?? 24 };
    },
    enabled: ready && api.isReady,
    placeholderData: keepPreviousData,
  });
}

export function useBuyer(id: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: buyerKeys.detail(scope, id),
    queryFn: async () => one<Buyer>(await api.get(`/api/dashboard/buyers/${id}`)),
    enabled: ready && api.isReady && Number.isInteger(id) && id > 0,
    retry: (count, err) => (err as ApiError).status !== 404 && count < 2,
  });
}

export function useBuyerActivities(id: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: buyerKeys.activities(scope, id),
    queryFn: async () => one<BuyerActivity[]>(await api.get(`/api/dashboard/buyers/${id}/activities`)) ?? [],
    enabled: ready && api.isReady && id > 0,
  });
}

export function useBuyerStages() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: buyerKeys.stages(scope),
    queryFn: async () => one<BuyerStage[]>(await api.get('/api/dashboard/buyers/stages')) ?? [],
    enabled: ready && api.isReady,
    staleTime: 5 * 60_000,
  });
}

export function useBuyerAgents() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: buyerKeys.agents(scope),
    queryFn: async () => one<BuyerAgent[]>(await api.get('/api/dashboard/buyers/agents')) ?? [],
    enabled: ready && api.isReady,
    staleTime: 5 * 60_000,
  });
}

export function useBuyerSettings() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: buyerKeys.settings(scope),
    queryFn: async () => one<BuyerMatchSettings>(await api.get('/api/dashboard/buyers/settings')),
    enabled: ready && api.isReady,
  });
}

// The tenant's website languages, for the buyer's language picker.
export function useTenantLanguages() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: buyerKeys.languages(scope),
    queryFn: async () => {
      const tenant = one<{ settings?: { languages?: string[]; defaultLanguage?: string } }>(
        await api.get('/api/dashboard/tenant'),
      );
      const langs = tenant?.settings?.languages?.length ? tenant.settings.languages : ['en'];
      return langs;
    },
    enabled: ready && api.isReady,
    // Read again each time a screen opens: a list kept for minutes still showed
    // languages removed in Settings meanwhile.
    staleTime: 0,
  });
}

function useBuyerMutation<TVars, TResult>(fn: (api: ReturnType<typeof useApi>, vars: TVars) => Promise<TResult>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: (vars) => fn(api, vars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
  });
}

export interface CreateBuyerInput {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: BuyerRole;
  assignedTo?: number;
}

export function useCreateBuyer() {
  return useBuyerMutation(async (api, body: CreateBuyerInput) => one<Buyer>(await api.post('/api/dashboard/buyers', body)));
}

export type UpdateBuyerInput = Partial<
  Omit<Buyer, 'id' | 'stage' | 'stageId' | 'assignedToUser' | 'contact' | 'agents' | 'property' | 'mergedIds' | 'source' | 'createdAt' | 'lastActivityAt' | 'wishlist'>
> & { email?: string; agentIds?: number[] };

export function useUpdateBuyer(id: number) {
  return useBuyerMutation(async (api, body: UpdateBuyerInput) => one<Buyer>(await api.put(`/api/dashboard/buyers/${id}`, body)));
}

export function useSetBuyerStage(id: number) {
  return useBuyerMutation(async (api, stageId: number) =>
    one<Buyer>(await api.put(`/api/dashboard/buyers/${id}/stage`, { stageId })),
  );
}

export function useAddBuyerActivity(id: number) {
  return useBuyerMutation(async (api, body: { type: string; description: string; via?: 'voice' }) =>
    one<BuyerActivity>(await api.post(`/api/dashboard/buyers/${id}/activities`, body)),
  );
}

export function useUpdateBuyerSettings() {
  return useBuyerMutation(async (api, body: Partial<Omit<BuyerMatchSettings, 'weights'>> & { weights?: Partial<BuyerMatchWeights> }) =>
    one<BuyerMatchSettings>(await api.put('/api/dashboard/buyers/settings', body)),
  );
}

// ── Display helpers ─────────────────────────────────────────────────────

export function buyerName(b: Pick<BuyerListItem, 'firstName' | 'lastName' | 'contact'> & { id?: number; erasedAt?: string | null }): string {
  if (b.erasedAt) return `Erased buyer${b.id ? ` #${b.id}` : ''}`;
  return [b.firstName, b.lastName].filter(Boolean).join(' ') || b.contact?.email || '—';
}

// The stage in the dashboard language, else English, else any name it has.
export function stageName(stage: Pick<BuyerStage, 'name'> | null | undefined): string {
  if (!stage) return '—';
  return stage.name[dashboardLanguage()] || stage.name.en || Object.values(stage.name)[0] || '—';
}

export function daysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}
