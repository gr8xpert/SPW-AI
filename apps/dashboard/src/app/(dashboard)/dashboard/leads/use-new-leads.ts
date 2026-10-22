'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import type { BuyerRole } from '../buyers/use-buyers';

// New Leads: website-form people without a role yet (api/dashboard/new-leads).
// The sidebar badge reads the count; every write refreshes both, and the
// Contacts (buyers) lists, where a sorted lead lands.

export interface NewLeadForm {
  type: 'enquiry' | 'wishlist_form' | string;
  message: string | null;
  metadata: { kind?: string; reference?: string | null; title?: string | null; pageUrl?: string | null; references?: string[] } | null;
  createdAt: string;
}

export interface NewLead {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  createdAt: string;
  handledAt: string | null;
  agent: { id: number; name: string | null } | null;
  forms: NewLeadForm[];
}

export const newLeadKeys = {
  all: ['new-leads'] as const,
  list: (scope: readonly unknown[], page: number, view: NewLeadView) => ['new-leads', 'list', ...scope, view, page] as const,
  count: (scope: readonly unknown[]) => ['new-leads', 'count', ...scope] as const,
};

// Waiting: not dealt with yet (the badge). Handled: marked handled by a
// client without Buyer Match; kept so they can still go to Contacts later.
export type NewLeadView = 'waiting' | 'handled';

export function useNewLeads(page: number, view: NewLeadView = 'waiting') {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: newLeadKeys.list(scope, page, view),
    queryFn: async (): Promise<{ data: NewLead[]; total: number; limit: number }> => {
      const res = await api.get(`/api/dashboard/new-leads?page=${page}&view=${view}`);
      const body = res?.data && Array.isArray(res.data.data) ? res.data : res;
      return { data: body?.data ?? [], total: body?.total ?? 0, limit: body?.limit ?? 20 };
    },
    enabled: ready && api.isReady,
    placeholderData: keepPreviousData,
  });
}

/** The sidebar badge. Refetches every minute so a new enquiry shows up. */
export function useNewLeadCount(enabled = true) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: newLeadKeys.count(scope),
    queryFn: async (): Promise<number> => {
      const res = await api.get('/api/dashboard/new-leads/count');
      return Number((res?.data ?? res)?.count ?? 0);
    },
    enabled: enabled && ready && api.isReady,
    refetchInterval: 60_000,
  });
}

function useNewLeadMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: newLeadKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['buyers'] });
    },
  });
}

export function useAssignNewLeadRole() {
  const api = useApi();
  return useNewLeadMutation(({ id, role }: { id: number; role: BuyerRole }) => api.put(`/api/dashboard/new-leads/${id}/role`, { role }));
}

export function useSetNewLeadHandled() {
  const api = useApi();
  return useNewLeadMutation(({ id, handled }: { id: number; handled: boolean }) =>
    api.put(`/api/dashboard/new-leads/${id}/handled`, { handled }),
  );
}

export function useDeleteNewLead() {
  const api = useApi();
  return useNewLeadMutation((id: number) => api.delete(`/api/dashboard/new-leads/${id}`));
}
