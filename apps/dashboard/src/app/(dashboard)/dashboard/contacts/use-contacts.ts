'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';

// React Query hooks for the Contacts page. Keys carry the signed-in user and
// impersonated tenant (useTenantQueryScope) so cached contacts never show for
// another login or client. Every write invalidates everything under 'contacts'.

export const contactKeys = {
  all: ['contacts'] as const,
  list: (scope: readonly unknown[], params: { page: number; search: string }) =>
    ['contacts', 'list', ...scope, params] as const,
};

export interface ContactsPage<TContact> {
  contacts: TContact[];
  total: number;
  totalPages: number;
}

export function useContacts<TContact>(page: number, search: string) {
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  return useQuery({
    queryKey: contactKeys.list(scope, { page, search }),
    // api.get reads the current token at call time (useApi keeps it in a ref).
    queryFn: async (): Promise<ContactsPage<TContact>> => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const res = await api.get(`/api/dashboard/contacts?${params}`);
      const body = res?.data || res;
      return {
        contacts: body.data || [],
        total: body.total || 0,
        totalPages: body.meta?.pages || Math.ceil((body.total || 0) / 20) || 1,
      };
    },
    enabled: ready && api.isReady,
    // Keep the current rows on screen while the next page / search loads,
    // as the page did before (it only replaced them when the answer came).
    placeholderData: keepPreviousData,
  });
}

/** Wraps any contacts write so a success refreshes every contacts list. */
export function useContactMutation<TVars>(mutationFn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },
  });
}
