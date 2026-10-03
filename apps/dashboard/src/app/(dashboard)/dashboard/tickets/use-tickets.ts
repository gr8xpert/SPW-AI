'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';

// React Query hooks for the client's own support tickets (/dashboard/tickets).
// Keys start with ['tickets', 'tenant'] — the webmaster and super-admin views
// use their own prefixes — and carry the signed-in user + impersonated tenant
// (useTenantQueryScope), so a cached ticket never shows for another login,
// role or client. Every write invalidates the whole ['tickets', 'tenant'] tree.

type Scope = readonly unknown[];

export const tenantTicketKeys = {
  all: ['tickets', 'tenant'] as const,
  list: (scope: Scope, page: number) => ['tickets', 'tenant', 'list', ...scope, { page }] as const,
  stats: (scope: Scope) => ['tickets', 'tenant', 'stats', ...scope] as const,
  detail: (scope: Scope, id: string | number) => ['tickets', 'tenant', 'detail', ...scope, String(id)] as const,
};

export interface TicketStatsCounts {
  open: number;
  inProgress: number;
  awaitingReply: number;
  resolved: number;
}

export function useTenantTickets<TTicket>(page: number) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: tenantTicketKeys.list(scope, page),
    // api.get reads the current token at call time (useApi keeps it in a ref).
    queryFn: async (): Promise<{ tickets: TTicket[]; totalPages: number }> => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      const res = await api.get(`/api/dashboard/tickets?${params}`);
      if (Array.isArray(res?.data)) {
        return { tickets: res.data, totalPages: Math.ceil((res.total || res.data.length) / 20) || 1 };
      }
      const body = res?.data || res;
      return { tickets: body?.data || [], totalPages: Math.ceil((body?.total || 0) / 20) || 1 };
    },
    enabled: ready && api.isReady,
    placeholderData: keepPreviousData,
  });
}

export function useTenantTicketStats() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: tenantTicketKeys.stats(scope),
    queryFn: async (): Promise<TicketStatsCounts> => {
      const res = await api.get('/api/dashboard/tickets/stats');
      const body = res?.data || res;
      return {
        open: body.open ?? 0,
        inProgress: body.inProgress ?? 0,
        awaitingReply: body.waitingCustomer ?? 0,
        resolved: body.resolved ?? 0,
      };
    },
    enabled: ready && api.isReady,
  });
}

/** One ticket with its messages. Pass a falsy id to keep it idle. */
export function useTenantTicket<TTicket>(id: string | number | null | undefined) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: tenantTicketKeys.detail(scope, id ?? ''),
    queryFn: async (): Promise<TTicket> => {
      const res = await api.get(`/api/dashboard/tickets/${id}`);
      return res?.data || res;
    },
    enabled: ready && api.isReady && !!id,
    // Always re-check on open: staff replies arrive server-side.
    staleTime: 0,
  });
}

/** Wraps any tenant-ticket write so a success refreshes lists, stats and details. */
export function useTenantTicketMutation<TVars>(mutationFn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tenantTicketKeys.all });
    },
  });
}
