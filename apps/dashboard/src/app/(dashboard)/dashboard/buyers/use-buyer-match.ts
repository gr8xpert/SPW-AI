'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { buyerKeys, one, type ApiError, type Buyer, type BuyerWishlist } from './use-buyers';
import type { RuleBrief } from './use-buyer-ai';

// Milestone B data: wishlist, matches, suggestions, sending.
// Same rules as use-buyers.ts: tenant scope in every key, api.* inline,
// writes invalidate everything under 'buyers'.

type Named = Record<string, string>;

export interface MatchProperty {
  id: number;
  reference: string;
  agentReference: string | null;
  title: Named | null;
  listingType: string;
  status: string;
  price: number | null;
  priceTo: number | null;
  rentalPeriod: string | null;
  currency: string;
  priceOnRequest: boolean;
  bedrooms: number | null;
  bedroomsTo: number | null;
  bathrooms: number | null;
  bathroomsTo: number | null;
  buildSize: number | null;
  buildSizeTo: number | null;
  plotSize: number | null;
  plotSizeTo: number | null;
  virtualTourUrl: string | null;
  image: string | null;
  location: { id: number; name: Named } | null;
  propertyType: { id: number; name: Named } | null;
}

export type WishReason =
  | { code: 'bedrooms_short'; n: number | null }
  | { code: 'bathrooms_short'; n: number | null }
  | { code: 'build_size' }
  | { code: 'plot_size' }
  | { code: 'feature'; id: number };

export type NearMissReason =
  | { code: 'over_budget'; amount: number }
  | { code: 'under_budget'; amount: number }
  | { code: 'nearby'; place: string; km: number | null };

export interface MatchItem extends MatchProperty {
  score: number;
  met: string[];
  missed: string[];
  reasons?: WishReason[];
  suggested: boolean;
  // Phase 3: the buyer's rules from the notes it breaks / can't be checked.
  ruleBreaks?: RuleBrief[];
  ruleUnknown?: RuleBrief[];
  // Only with "show all": already sent to the buyer, or rejected.
  hiddenReason?: 'sent' | 'rejected';
}

export interface MatchResult {
  data: MatchItem[];
  total: number;
  capped: boolean;
  page: number;
  limit: number;
  empty: boolean;
  hiddenCount: number;
}

export type SuggestionStatus = 'suggested' | 'sent' | 'visited' | 'interested' | 'not_interested';
export const SUGGESTION_STATUSES: SuggestionStatus[] = ['suggested', 'sent', 'visited', 'interested', 'not_interested'];

export interface Suggestion {
  id: number;
  propertyId: number;
  note: string | null;
  virtualTourUrl: string | null;
  visitDate: string | null;
  status: SuggestionStatus;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  likedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  viewingAt: string | null;
  offerAt: string | null;
  createdAt: string;
  property: MatchProperty | null;
}

export interface NearMissItem extends MatchItem {
  miss: NearMissReason;
}

export interface NearMissResult {
  data: NearMissItem[];
  total: number;
  page: number;
  limit: number;
  empty: boolean;
  enabled: boolean;
  hiddenCount: number;
}

export interface ReverseBuyer {
  id: number;
  name: string | null;
  email: string | null;
  agent: { id: number; name: string | null } | null;
  score: number;
  missed: string[];
  sent: boolean;
  rejected: boolean;
}

export interface ReverseResult {
  property: { id: number; reference: string; live: boolean };
  total: number;
  fresh: number;
  buyers: ReverseBuyer[];
}

export interface ReverseSendResult {
  sent: number;
  skipped: number;
  failed: number;
  results: { leadId: number; status: 'sent' | 'skipped' | 'failed'; reason?: string }[];
}

export type TimelineEventType = 'sent' | 'opened' | 'clicked' | 'liked' | 'rejected' | 'cleared' | 'viewing' | 'offer';
export type AgentMark = 'liked' | 'rejected' | 'cleared' | 'viewing' | 'offer';

export interface TimelineEntry {
  id: number;
  event: TimelineEventType;
  source: 'email' | 'page' | 'agent' | 'alert';
  note: string | null;
  createdAt: string;
  user: { id: number; name: string | null } | null;
}

export interface ChangeEntry {
  id: number;
  source: 'dashboard' | 'website' | 'import' | 'system';
  createdAt: string;
  user: { id: number; name: string | null } | null;
  changes: { field: string; from: string | null; to: string | null }[];
}

export interface SkippedProperty {
  propertyId: number;
  reference: string;
  reason: 'sent' | 'rejected';
}

export interface PickOption {
  id: number;
  parentId: number | null;
  name: Named;
  level?: string;
  category?: string;
  sortOrder?: number;
}

export interface SendBody {
  propertyIds: number[];
  recipients: ('buyer' | 'agent')[];
  message?: string;
  lang?: string;
  allowResend?: boolean;
}

const matchKeys = {
  matches: (scope: readonly unknown[], id: number, page: number, all: boolean) => ['buyers', 'matches', ...scope, id, page, all] as const,
  timeline: (scope: readonly unknown[], sid: number) => ['buyers', 'timeline', ...scope, sid] as const,
  changes: (scope: readonly unknown[], id: number, page: number) => ['buyers', 'changes', ...scope, id, page] as const,
  suggestions: (scope: readonly unknown[], id: number) => ['buyers', 'suggestions', ...scope, id] as const,
  options: (scope: readonly unknown[], kind: string) => ['buyers', 'options', ...scope, kind] as const,
};

function list<T>(res: unknown): T[] {
  const r = res as { data?: T[] } | T[] | null;
  return (Array.isArray(r) ? r : r?.data) ?? [];
}

export function useBuyerMatches(id: number, page: number, enabled = true, all = false) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: matchKeys.matches(scope, id, page, all),
    queryFn: async () => (await api.get(`/api/dashboard/buyers/${id}/matches?page=${page}&limit=25${all ? '&all=1' : ''}`)) as MatchResult,
    enabled: enabled && ready && api.isReady && id > 0,
    placeholderData: keepPreviousData,
  });
}

export function useBuyerNearMisses(id: number, page: number, all = false) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'near-misses', ...scope, id, page, all] as const,
    queryFn: async () => (await api.get(`/api/dashboard/buyers/${id}/near-misses?page=${page}&limit=25${all ? '&all=1' : ''}`)) as NearMissResult,
    enabled: ready && api.isReady && id > 0,
    placeholderData: keepPreviousData,
  });
}

// Reverse match: the buyers whose wishlist a property meets.
export function useReverseMatch(propertyId: number, enabled: boolean) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'reverse', ...scope, propertyId] as const,
    queryFn: async () => one<ReverseResult>(await api.get(`/api/dashboard/buyers/reverse/${propertyId}`)),
    enabled: enabled && ready && api.isReady && propertyId > 0,
  });
}

export function useReverseSend(propertyId: number) {
  return useMatchMutation(async (api, leadIds: number[] | undefined) =>
    one<ReverseSendResult>(await api.post(`/api/dashboard/buyers/reverse/${propertyId}/send`, leadIds ? { leadIds } : {})),
  );
}

export type AlertStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'skipped';

export interface AlertItem {
  id: number;
  kind: 'new_listing' | 'price_drop';
  status: AlertStatus;
  oldPrice: number | null;
  newPrice: number | null;
  score: number;
  createdAt: string;
  decidedAt: string | null;
  sentAt: string | null;
  buyer: { id: number; name: string | null; email: string | null; agent: string | null };
  property: MatchProperty | null;
}

export function useBuyerAlerts(status: AlertStatus, page: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'alerts', ...scope, status, page] as const,
    queryFn: async () => (await api.get(`/api/dashboard/buyers/alerts?status=${status}&page=${page}`)) as { data: AlertItem[]; total: number; page: number; pendingCount: number },
    enabled: ready && api.isReady,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useDecideAlerts() {
  return useMatchMutation(async (api, body: { ids: number[]; action: 'approve' | 'reject' | 'send_now' }) =>
    one<{ updated: number; sent: number; skipped: number }>(await api.post('/api/dashboard/buyers/alerts/decide', body)),
  );
}

export function useScanAlerts() {
  return useMatchMutation(async (api, _: void) =>
    one<{ seeded: number; checked: number; newListings: number; priceDrops: number; alerts: number }>(await api.post('/api/dashboard/buyers/alerts/scan', {})),
  );
}

export function useBuyerSuggestions(id: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: matchKeys.suggestions(scope, id),
    queryFn: async () => one<Suggestion[]>(await api.get(`/api/dashboard/buyers/${id}/suggestions`)) ?? [],
    enabled: ready && api.isReady && id > 0,
  });
}

// Locations, property types and features for the wishlist pickers.
export function useMatchOptions(kind: 'locations' | 'property-types' | 'features') {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: matchKeys.options(scope, kind),
    queryFn: async () => list<PickOption>(await api.get(`/api/dashboard/${kind}`)),
    enabled: ready && api.isReady,
    staleTime: 5 * 60_000,
  });
}

function useMatchMutation<TVars, TResult>(fn: (api: ReturnType<typeof useApi>, vars: TVars) => Promise<TResult>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<TResult, ApiError, TVars>({
    mutationFn: (vars) => fn(api, vars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
  });
}

export function useSaveWishlist(id: number) {
  return useMatchMutation(async (api, body: BuyerWishlist) => one<Buyer>(await api.put(`/api/dashboard/buyers/${id}/wishlist`, body)));
}

export function useAddSuggestions(id: number) {
  return useMatchMutation(async (api, body: { propertyIds?: number[]; references?: string[] }) =>
    one<{ added: number; existing: number; notFound: (string | number)[] }>(await api.post(`/api/dashboard/buyers/${id}/suggestions`, body)),
  );
}

export function useUpdateSuggestion() {
  return useMatchMutation(
    async (api, { id, ...body }: { id: number; note?: string | null; virtualTourUrl?: string | null; visitDate?: string | null; status?: SuggestionStatus }) =>
      one<Suggestion>(await api.put(`/api/dashboard/buyers/suggestions/${id}`, body)),
  );
}

export function useRemoveSuggestion() {
  return useMatchMutation(async (api, id: number) => {
    await api.delete(`/api/dashboard/buyers/suggestions/${id}`);
  });
}

export function useSendProperties(id: number) {
  return useMatchMutation(async (api, body: SendBody) =>
    one<{ lang: string; results: { email: string; kind: string; ok: boolean }[]; skipped: SkippedProperty[] }>(await api.post(`/api/dashboard/buyers/${id}/send`, body)),
  );
}

// The agent marks a step on a suggested property's timeline.
export function useSuggestionEvent() {
  return useMatchMutation(async (api, { id, ...body }: { id: number; event: AgentMark; note?: string }) =>
    one<Suggestion>(await api.post(`/api/dashboard/buyers/suggestions/${id}/events`, body)),
  );
}

export function useSuggestionTimeline(sid: number, enabled: boolean) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: matchKeys.timeline(scope, sid),
    queryFn: async () => one<TimelineEntry[]>(await api.get(`/api/dashboard/buyers/suggestions/${sid}/timeline`)) ?? [],
    enabled: enabled && ready && api.isReady && sid > 0,
  });
}

export interface BuyerPageStatus {
  enabled: boolean;
  hasCode: boolean;
  url: string | null;
  via: 'settings' | 'plugin' | 'fallback' | null;
}

export function useBuyerPage(id: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'page', ...scope, id] as const,
    queryFn: async () => one<BuyerPageStatus>(await api.get(`/api/dashboard/buyers/${id}/page`)),
    enabled: ready && api.isReady && id > 0,
  });
}

export function useBuyerPageAction(id: number) {
  return useMatchMutation(async (api, action: 'create' | 'enable' | 'disable' | 'renew') =>
    one<BuyerPageStatus>(await api.post(`/api/dashboard/buyers/${id}/page`, { action })),
  );
}

export function useBuyerChanges(id: number, page: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: matchKeys.changes(scope, id, page),
    queryFn: async () => (await api.get(`/api/dashboard/buyers/${id}/changes?page=${page}`)) as { data: ChangeEntry[]; total: number; page: number },
    enabled: ready && api.isReady && id > 0,
    placeholderData: keepPreviousData,
  });
}

// The email as it will go out; no cache (it follows the dialog's fields).
export function useSendPreview(id: number) {
  const api = useApi();
  return useMutation<
    { subject: string; html: string; lang: string; to: { kind: string; email: string }[]; skipped: SkippedProperty[]; allSkipped: boolean },
    ApiError,
    SendBody
  >({
    mutationFn: async (body) => one(await api.post(`/api/dashboard/buyers/${id}/send/preview`, body)),
  });
}

// Downloads the Suggested PDF (all, or only `ids`).
export function useSuggestionsPdf(id: number) {
  const api = useApi();
  return useMutation<void, Error, { lang?: string; ids?: number[] }>({
    mutationFn: async ({ lang, ids }) => {
      const q = new URLSearchParams();
      if (lang) q.set('lang', lang);
      if (ids?.length) q.set('ids', ids.join(','));
      const res = await api.getRaw(`/api/dashboard/buyers/${id}/suggestions.pdf${q.toString() ? `?${q}` : ''}`);
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'Selection.pdf';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
  });
}

export function nameOf(name: Named | string | null | undefined, lang = 'en'): string {
  if (!name) return '';
  if (typeof name === 'string') return name;
  return name[lang] || name.en || Object.values(name).find(Boolean) || '';
}
