'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';

// React Query hooks for the webmaster's assigned tickets. Keys start with
// ['tickets', 'webmaster'] (the client and super-admin views use their own
// prefixes) and carry the signed-in user + impersonated tenant, so one
// webmaster's cache is never shown to another login. Writes invalidate the
// whole ['tickets', 'webmaster'] tree.

type Scope = readonly unknown[];

export const webmasterTicketKeys = {
  all: ['tickets', 'webmaster'] as const,
  list: (scope: Scope) => ['tickets', 'webmaster', 'list', ...scope] as const,
  detail: (scope: Scope, id: string | number) => ['tickets', 'webmaster', 'detail', ...scope, String(id)] as const,
  timeEntries: (scope: Scope) => ['tickets', 'webmaster', 'time-entries', ...scope] as const,
};

export function useWebmasterTickets<TTicket>() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: webmasterTicketKeys.list(scope),
    // api.get reads the current token at call time (useApi keeps it in a ref).
    queryFn: async (): Promise<TTicket[]> => {
      const response = await api.get('/api/webmaster/tickets');
      const body = response?.data ?? response;
      return Array.isArray(body) ? body : [];
    },
    enabled: ready && api.isReady,
  });
}

export function useWebmasterTicket<TTicket>(id: string | number | null | undefined) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: webmasterTicketKeys.detail(scope, id ?? ''),
    queryFn: async (): Promise<TTicket> => {
      const res = await api.get(`/api/webmaster/tickets/${id}`);
      return res?.data || res;
    },
    enabled: ready && api.isReady && !!id,
    staleTime: 0,
  });
}

/** All of the webmaster's time entries (pages filter by ticket). */
export function useWebmasterTimeEntries<TEntry>() {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: webmasterTicketKeys.timeEntries(scope),
    queryFn: async (): Promise<TEntry[]> => {
      const res = await api.get('/api/webmaster/time-entries');
      const body = res?.data || res;
      return Array.isArray(body)
        ? body
        : Array.isArray(body?.entries)
          ? body.entries
          : [];
    },
    enabled: ready && api.isReady,
    staleTime: 0,
  });
}

/** Wraps any webmaster-ticket write so a success refreshes lists, details and time entries. */
export function useWebmasterTicketMutation<TVars>(mutationFn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: webmasterTicketKeys.all });
    },
  });
}
