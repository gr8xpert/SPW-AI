'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

export interface DashboardAddons {
  addProperty: boolean;
  emailCampaign: boolean;
  feedExport: boolean;
  team: boolean;
  aiChat: boolean;
}

export const ALL_LOCKED: DashboardAddons = {
  addProperty: false,
  emailCampaign: false,
  feedExport: false,
  team: false,
  aiChat: false,
};

interface TenantResponse {
  dashboardAddons?: DashboardAddons | null;
}

// Process-wide cache so every component reading the addons does ONE
// fetch per dashboard session (and re-fetches on explicit invalidate).
// Using module-level state instead of context avoids prop-drilling
// while keeping the hook usable from any client component.
let cached: DashboardAddons | null = null;
let inflight: Promise<DashboardAddons> | null = null;
const subscribers = new Set<(a: DashboardAddons) => void>();

async function load(): Promise<DashboardAddons> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const raw = await apiGet<TenantResponse | { data: TenantResponse }>(
        '/api/dashboard/tenant',
      );
      const tenant: TenantResponse =
        raw && typeof raw === 'object' && 'data' in raw && raw.data
          ? raw.data
          : (raw as TenantResponse);
      const addons: DashboardAddons = {
        ...ALL_LOCKED,
        ...(tenant?.dashboardAddons ?? {}),
      };
      cached = addons;
      subscribers.forEach((fn) => fn(addons));
      return addons;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateDashboardAddons(): void {
  cached = null;
}

export function useDashboardAddons(): {
  addons: DashboardAddons;
  isLoading: boolean;
} {
  const [addons, setAddons] = useState<DashboardAddons>(cached ?? ALL_LOCKED);
  const [isLoading, setIsLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    let live = true;
    if (cached) {
      setAddons(cached);
      setIsLoading(false);
      return;
    }
    const onUpdate = (a: DashboardAddons) => {
      if (live) {
        setAddons(a);
        setIsLoading(false);
      }
    };
    subscribers.add(onUpdate);
    load()
      .then(onUpdate)
      .catch(() => {
        // Network / auth failures: leave everything locked. Better
        // safe-default than accidentally showing a feature the tenant
        // hasn't paid for.
        if (live) setIsLoading(false);
      });
    return () => {
      live = false;
      subscribers.delete(onUpdate);
    };
  }, []);

  return { addons, isLoading };
}

export type DashboardAddonKey = keyof DashboardAddons;
