'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';

// React Query hooks for the super-admin ticket desk (all clients). Keys start
// with ['tickets', 'admin'] (the client and webmaster views use their own
// prefixes) and carry the signed-in user + impersonated tenant, so the
// all-clients cache is never served to another login or an impersonation
// session. Writes invalidate the whole ['tickets', 'admin'] tree.

type Scope = readonly unknown[];

export const adminTicketKeys = {
  all: ['tickets', 'admin'] as const,
  list: (scope: Scope, params: { status: string; page: number; limit: number }) =>
    ['tickets', 'admin', 'list', ...scope, params] as const,
  stats: (scope: Scope) => ['tickets', 'admin', 'stats', ...scope] as const,
  detail: (scope: Scope, id: string | number) => ['tickets', 'admin', 'detail', ...scope, String(id)] as const,
  timeEntries: (scope: Scope, id: string | number) =>
    ['tickets', 'admin', 'time-entries', ...scope, String(id)] as const,
  webmasters: (scope: Scope) => ['tickets', 'admin', 'webmasters', ...scope] as const,
};

function useScopedReady() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return { api, scope, enabled: ready && api.isReady };
}

export function useAdminTickets<TTicket>(status: string, page: number, limit: number) {
  const { api, scope, enabled } = useScopedReady();
  return useQuery({
    queryKey: adminTicketKeys.list(scope, { status, page, limit }),
    // api.get reads the current token at call time (useApi keeps it in a ref).
    queryFn: async (): Promise<{ tickets: TTicket[]; total: number }> => {
      const params = new URLSearchParams();
      if (status !== 'all') params.append('status', status);
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      const response = await api.get(`/api/super-admin/tickets?${params.toString()}`);
      const body = response?.data ?? response;
      if (Array.isArray(body)) return { tickets: body, total: body.length };
      return { tickets: body?.data ?? [], total: body?.total ?? 0 };
    },
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useAdminTicketStats<TStats>(unwrap: (response: unknown) => TStats) {
  const { api, scope, enabled } = useScopedReady();
  return useQuery({
    queryKey: adminTicketKeys.stats(scope),
    queryFn: async (): Promise<TStats> => unwrap(await api.get('/api/super-admin/tickets/stats')),
    enabled,
  });
}

export function useAdminTicket<TTicket>(id: string | number | null | undefined) {
  const { api, scope, enabled } = useScopedReady();
  return useQuery({
    queryKey: adminTicketKeys.detail(scope, id ?? ''),
    queryFn: async (): Promise<TTicket> => {
      const res = await api.get(`/api/super-admin/tickets/${id}`);
      return res?.data || res;
    },
    enabled: enabled && !!id,
    staleTime: 0,
  });
}

export function useAdminWebmasters<TWebmaster>() {
  const { api, scope, enabled } = useScopedReady();
  return useQuery({
    queryKey: adminTicketKeys.webmasters(scope),
    queryFn: async (): Promise<TWebmaster[]> => {
      const res = await api.get('/api/super-admin/webmasters');
      const body = res?.data || res;
      return Array.isArray(body) ? body : [];
    },
    enabled,
  });
}

export function useAdminTicketTimeEntries<TEntry>(id: string | number | null | undefined) {
  const { api, scope, enabled } = useScopedReady();
  return useQuery({
    queryKey: adminTicketKeys.timeEntries(scope, id ?? ''),
    queryFn: async (): Promise<TEntry[]> => {
      const res = await api.get(`/api/super-admin/webmasters/tickets/${id}/time-entries`);
      const body = res?.data || res;
      return Array.isArray(body) ? body : [];
    },
    enabled: enabled && !!id,
    staleTime: 0,
  });
}

/** Wraps any admin ticket write so a success refreshes lists, stats and details. */
export function useAdminTicketMutation<TVars>(mutationFn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminTicketKeys.all });
    },
  });
}
