'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { apiGet } from '@/lib/api';
import { useImpersonation } from '@/hooks/use-impersonation';

export interface DashboardAddons {
  addProperty: boolean;
  emailCampaign: boolean;
  feedExport: boolean;
  team: boolean;
  aiChat: boolean;
  aiTranslation: boolean;
}

export type TenantTier = 1 | 2 | 3;

export const ALL_LOCKED: DashboardAddons = {
  addProperty: false,
  emailCampaign: false,
  feedExport: false,
  team: false,
  aiChat: false,
  aiTranslation: false,
};

interface TenantResponse {
  dashboardAddons?: DashboardAddons | null;
  tier?: TenantTier | number | null;
}

interface TenantMeta {
  addons: DashboardAddons;
  tier: TenantTier;
}

function coerceTier(raw: unknown): TenantTier {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (n === 2 || n === 3) return n as TenantTier;
  return 1;
}

async function fetchTenantMeta(): Promise<TenantMeta> {
  const raw = await apiGet<TenantResponse | { data: TenantResponse }>('/api/dashboard/tenant');
  const tenant: TenantResponse =
    raw && typeof raw === 'object' && 'data' in raw && raw.data
      ? raw.data
      : (raw as TenantResponse);
  return {
    addons: { ...ALL_LOCKED, ...(tenant?.dashboardAddons ?? {}) },
    tier: coerceTier(tenant?.tier),
  };
}

/**
 * The client's tier and add-ons, which decide what the dashboard greys out.
 *
 * This used to be fetched once per session into a module variable, falling
 * back to "Tier 1, nothing unlocked" if that one request failed — so a single
 * dropped request, or a tier changed while the client was logged in, left the
 * whole dashboard locked until a hard refresh. Now:
 *   - keyed by the signed-in user (and impersonated client), so a new login
 *     never reuses another session's answer;
 *   - retried with backoff, re-checked when the tab regains focus and every
 *     few minutes, so a tier change shows up without a reload;
 *   - `known` is false until a real answer arrives. Callers must not treat
 *     "not known yet" as "locked": the API does not enforce tiers, so the
 *     greying is guidance only and a wrong lock is the worse failure.
 */
export function useDashboardAddons(): {
  addons: DashboardAddons;
  tier: TenantTier;
  known: boolean;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
} {
  const { data: session, status } = useSession();
  const { session: impersonation } = useImpersonation();
  const who = (session?.user as { id?: string | number; email?: string } | undefined);

  const query = useQuery({
    queryKey: ['tenant-meta', who?.id ?? who?.email ?? null, impersonation?.tenant.id ?? null],
    queryFn: fetchTenantMeta,
    enabled: status === 'authenticated',
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
  });

  const meta = query.data;
  return {
    addons: meta?.addons ?? ALL_LOCKED,
    tier: meta?.tier ?? 1,
    known: !!meta,
    isLoading: !meta && !query.isError,
    isError: !meta && query.isError,
    retry: () => void query.refetch(),
  };
}

export type DashboardAddonKey = keyof DashboardAddons;
