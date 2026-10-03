'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';

// React Query hooks for the Leads pipeline. Keys carry the signed-in user and
// impersonated tenant (useTenantQueryScope) so a cached pipeline never shows
// for another login or client. Writes invalidate everything under 'leads'.

export const leadKeys = {
  all: ['leads'] as const,
  list: (scope: readonly unknown[]) => ['leads', 'list', ...scope] as const,
};

export function useLeads<TLead>() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: leadKeys.list(scope),
    // api.get reads the current token at call time (useApi keeps it in a ref),
    // so capturing it here cannot send a stale/empty Authorization header.
    queryFn: async (): Promise<TLead[]> => {
      const res = await api.get('/api/dashboard/leads');
      const body = res?.data || res;
      return Array.isArray(body) ? body : body.data || [];
    },
    enabled: ready && api.isReady,
  });
}

export function useUpdateLeadStatus() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put(`/api/dashboard/leads/${id}`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}

export function useCreateLead() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/dashboard/leads', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leadKeys.all });
    },
  });
}
