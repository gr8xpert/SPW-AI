'use client';

import { useSession } from 'next-auth/react';
import { useImpersonation } from '@/hooks/use-impersonation';

/**
 * Who the dashboard is currently fetching for: the signed-in user and, while a
 * super-admin is acting as a client, that client's tenant. Put it in every
 * React Query key for tenant data so a cached answer never shows up for a
 * different login or impersonated client (same idea as useDashboardAddons).
 *
 * `ready` is false until the session is known; gate `enabled` on it so the
 * first request goes out with the right token and key.
 */
export function useTenantQueryScope(): {
  scope: readonly [string | number | null, number | null];
  ready: boolean;
} {
  const { data: session, status } = useSession();
  const { session: impersonation } = useImpersonation();
  const who = session?.user as { id?: string | number; email?: string } | undefined;
  return {
    scope: [who?.id ?? who?.email ?? null, impersonation?.tenant.id ?? null] as const,
    ready: status === 'authenticated',
  };
}

type Scope = ReturnType<typeof useTenantQueryScope>['scope'];

/**
 * Query keys for property data. Every key starts with 'properties', so
 * `invalidateQueries({ queryKey: propertyKeys.all })` refreshes lists and
 * details for every scope after a write.
 */
export const propertyKeys = {
  all: ['properties'] as const,
  lists: () => ['properties', 'list'] as const,
  list: (scope: Scope, params: Record<string, unknown>) => ['properties', 'list', ...scope, params] as const,
  details: () => ['properties', 'detail'] as const,
  detail: (scope: Scope, id: string | number) => ['properties', 'detail', ...scope, String(id)] as const,
};
