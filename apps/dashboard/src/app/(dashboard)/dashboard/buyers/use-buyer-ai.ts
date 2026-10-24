'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { buyerKeys, one, type ApiError, type BuyerWishlist } from './use-buyers';

// Phase 3 (AI) data. Same rules as use-buyers.ts: tenant scope in every key,
// api.* inline (never inside a useCallback), writes invalidate 'buyers'.

export type RuleNumberField =
  | 'price' | 'bedrooms' | 'bathrooms' | 'buildSize' | 'plotSize' | 'terraceSize' | 'gardenSize' | 'builtYear' | 'distanceToBeach' | 'communityFees';

export type NoteRuleBody =
  | { kind: 'floor'; mode: 'avoid' | 'require'; value: 'ground' | 'top' }
  | { kind: 'feature'; mode: 'avoid' | 'require'; featureId: number }
  | { kind: 'type'; mode: 'avoid'; propertyTypeId: number }
  | { kind: 'place'; mode: 'avoid'; locationId: number }
  | { kind: 'max' | 'min'; field: RuleNumberField; value: number };

export type NoteRule = NoteRuleBody & { id: string; text: string; strength: 'hard' | 'soft' };

export interface RuleBrief {
  id: string;
  text: string;
  strength: 'hard' | 'soft';
}

export interface WishlistChange {
  field: keyof BuyerWishlist;
  from: unknown;
  to: unknown;
}

export interface AiProposal {
  wishlist: BuyerWishlist;
  changes: WishlistChange[];
  places: { name: string; id: number | null; label: string | null }[];
  rules: NoteRule[];
  note?: string;
  transcript?: string;
}

const aiKeys = {
  status: (scope: readonly unknown[]) => ['buyers', 'ai-status', ...scope] as const,
};

export function useAiStatus() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: aiKeys.status(scope),
    queryFn: async () => one<{ hasKey: boolean }>(await api.get('/api/dashboard/buyers/ai/status')),
    enabled: ready && api.isReady,
    staleTime: 5 * 60_000,
  });
}

// Asking the AI changes nothing, so nothing is invalidated.
function useAiCall<TVars, TResult>(fn: (api: ReturnType<typeof useApi>, vars: TVars) => Promise<TResult>) {
  const api = useApi();
  return useMutation<TResult, ApiError, TVars>({ mutationFn: (vars) => fn(api, vars) });
}

export function usePasteToWishlist(id: number) {
  return useAiCall(async (api, text: string) => one<AiProposal>(await api.post(`/api/dashboard/buyers/${id}/ai/paste`, { text })));
}

export function useReadRules(id: number) {
  return useAiCall(async (api) => one<{ rules: NoteRule[]; notesHash: string }>(await api.post(`/api/dashboard/buyers/${id}/ai/rules`)));
}

export function useVoiceNote(id: number) {
  return useAiCall(async (api, audio: Blob) => {
    const fd = new FormData();
    fd.append('audio', audio, 'note.wav');
    return one<AiProposal & { note: string; transcript: string }>(await api.post(`/api/dashboard/buyers/${id}/ai/voice`, fd));
  });
}

export function useSaveRules(id: number) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<{ noteRules: NoteRule[]; rulesStale: boolean }, ApiError, { rules: NoteRule[]; notesHash?: string }>({
    mutationFn: async (body) => one(await api.put(`/api/dashboard/buyers/${id}/rules`, body)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
  });
}

// The saved rules plus the accepted new ones (a new rule replaces a saved
// one with the same id).
export function mergeRules(saved: NoteRule[] | null | undefined, added: NoteRule[]): NoteRule[] {
  const ids = new Set(added.map((r) => r.id));
  return [...(saved ?? []).filter((r) => !ids.has(r.id)), ...added].slice(0, 20);
}

// The wishlist after the ticked changes.
export function applyChanges(current: BuyerWishlist | null, changes: WishlistChange[]): BuyerWishlist {
  const { guessed: _g, ...rest } = current ?? {};
  const next: Record<string, unknown> = { ...rest };
  for (const c of changes) next[c.field] = c.to;
  return next as BuyerWishlist;
}

// ── Milestone M ─────────────────────────────────────────────────────────

export interface BuyerSummary {
  lines: string[] | null;
  at: string | null;
  stale: boolean;
  hasKey: boolean;
}

// The record's summary. The API returns the cached one when nothing changed
// and writes a new one when it is missing or stale. Any buyer write
// invalidates 'buyers', so the record asks again after an edit.
export function useBuyerSummary(id: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'ai-summary', ...scope, id] as const,
    queryFn: async () => one<BuyerSummary>(await api.post(`/api/dashboard/buyers/${id}/ai/summary`, {})),
    enabled: ready && api.isReady,
    staleTime: Infinity,
    retry: false,
  });
}

export function useRefreshSummary(id: number) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<BuyerSummary, ApiError, void>({
    mutationFn: async () => one(await api.post(`/api/dashboard/buyers/${id}/ai/summary`, { force: true })),
    onSuccess: (data) => {
      queryClient.setQueriesData({ queryKey: ['buyers', 'ai-summary'], predicate: (q) => q.queryKey[q.queryKey.length - 1] === id }, data);
    },
  });
}

export function useEmailIntro(id: number) {
  return useAiCall(async (api, body: { propertyIds: number[]; lang?: string; channel?: 'email' | 'whatsapp' }) =>
    one<{ text: string }>(await api.post(`/api/dashboard/buyers/${id}/ai/email-intro`, body)),
  );
}

export interface FeedbackSuggestion {
  key: string;
  kind: 'feature' | 'rule';
  featureId?: number;
  rule?: NoteRuleBody;
  liked: number;
  likedTotal: number;
  rejected: number;
  rejectedTotal: number;
}

export function useFeedbackPatterns(id: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: ['buyers', 'ai-feedback', ...scope, id] as const,
    queryFn: async () =>
      one<{ suggestions: FeedbackSuggestion[]; liked: number; rejected: number; comments: number }>(await api.get(`/api/dashboard/buyers/${id}/ai/feedback`)),
    enabled: ready && api.isReady,
  });
}

export function useReadComments(id: number) {
  return useAiCall(async (api) => one<AiProposal>(await api.post(`/api/dashboard/buyers/${id}/ai/feedback`)));
}

export function useDismissSuggestion(id: number) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: async (key) => api.post(`/api/dashboard/buyers/${id}/ai/dismiss`, { key }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
  });
}
