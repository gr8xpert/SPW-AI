'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiKeyScope, ApiKeySettings, ApiKeySummary } from '@spm/shared';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';

// Website keys (api/dashboard/api-keys). Same rules as the buyer hooks:
// tenant scope in every query key, api.* called inline, writes refresh the list.

export interface KeyStats {
  count: number;
  views30d: number;
  enquiries30d: number;
}

export type WebsiteKey = ApiKeySummary & KeyStats;

// What the editor saves.
export interface WebsiteKeyInput {
  name: string;
  scope: ApiKeyScope;
  allowedDomains: string[];
  settings: ApiKeySettings;
}

export interface KeySuggestion {
  name: string;
  why: string;
  scope: ApiKeyScope;
  count: number;
}

export interface WebsiteKeyList {
  main: { last4: string } & KeyStats;
  keys: WebsiteKey[];
  total: number;
}

export interface ScopePreview {
  count: number;
  total: number;
  sample: Array<{ reference: string; title: string; price: number | null; currency: string; image: string | null }>;
}

const unwrap = <T,>(res: unknown): T => {
  const r = res as { data?: T } | null;
  return (r && typeof r === 'object' && 'data' in r ? r.data : r) as T;
};

const keysRoot = ['website-keys'] as const;

export function useWebsiteKeys() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: [...keysRoot, ...scope],
    queryFn: async () => unwrap<WebsiteKeyList>(await api.get('/api/dashboard/api-keys')),
    enabled: ready && api.isReady,
  });
}

// The live count while a scope is edited; the scope itself is the query key,
// so each change asks once and going back to an earlier choice is instant.
export function useScopePreview(draft: ApiKeyScope, enabled: boolean) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: [...keysRoot, 'preview', ...scope, JSON.stringify(draft)],
    queryFn: async () => unwrap<ScopePreview>(await api.post('/api/dashboard/api-keys/preview', { scope: draft })),
    enabled: enabled && ready && api.isReady,
    staleTime: 60_000,
  });
}

function useKeyMutation<TVars, TResult>(fn: (api: ReturnType<typeof useApi>, vars: TVars) => Promise<TResult>) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: (vars) => fn(api, vars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keysRoot });
    },
  });
}

export function useCreateWebsiteKey() {
  return useKeyMutation(async (api, body: WebsiteKeyInput) =>
    unwrap<{ key: ApiKeySummary; apiKey: string }>(await api.post('/api/dashboard/api-keys', body)),
  );
}

export function useUpdateWebsiteKey() {
  return useKeyMutation(async (api, { id, ...body }: { id: number; isActive?: boolean } & Partial<WebsiteKeyInput>) =>
    unwrap<ApiKeySummary>(await api.patch(`/api/dashboard/api-keys/${id}`, body)),
  );
}

export function useRotateWebsiteKey() {
  return useKeyMutation(async (api, id: number) =>
    unwrap<{ key: ApiKeySummary; apiKey: string }>(await api.post(`/api/dashboard/api-keys/${id}/rotate`)),
  );
}

export function useRemoveWebsiteKey() {
  return useKeyMutation(async (api, id: number) => {
    await api.delete(`/api/dashboard/api-keys/${id}`);
  });
}

export function useAiScope() {
  const api = useApi();
  return useMutation<{ scope: ApiKeyScope | null; summary: string; name: string }, Error, string>({
    mutationFn: async (text) => unwrap(await api.post('/api/dashboard/api-keys/ai-scope', { text })),
  });
}

export function useSuggestKeys() {
  const api = useApi();
  return useMutation<KeySuggestion[], Error, void>({
    mutationFn: async () => unwrap(await api.post('/api/dashboard/api-keys/suggest')),
  });
}
