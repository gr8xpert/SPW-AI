'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

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

const DEFAULT_META: TenantMeta = {
  addons: ALL_LOCKED,
  tier: 1,
};

// Process-wide cache so every component reading the addons does ONE
// fetch per dashboard session (and re-fetches on explicit invalidate).
// Using module-level state instead of context avoids prop-drilling
// while keeping the hook usable from any client component.
let cached: TenantMeta | null = null;
let inflight: Promise<TenantMeta> | null = null;
const subscribers = new Set<(m: TenantMeta) => void>();

function coerceTier(raw: unknown): TenantTier {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (n === 2 || n === 3) return n as TenantTier;
  return 1;
}

async function load(): Promise<TenantMeta> {
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
      const meta: TenantMeta = {
        addons: { ...ALL_LOCKED, ...(tenant?.dashboardAddons ?? {}) },
        tier: coerceTier(tenant?.tier),
      };
      cached = meta;
      subscribers.forEach((fn) => fn(meta));
      return meta;
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
  tier: TenantTier;
  isLoading: boolean;
} {
  const [meta, setMeta] = useState<TenantMeta>(cached ?? DEFAULT_META);
  const [isLoading, setIsLoading] = useState<boolean>(cached === null);

  useEffect(() => {
    let live = true;
    if (cached) {
      setMeta(cached);
      setIsLoading(false);
      return;
    }
    const onUpdate = (m: TenantMeta) => {
      if (live) {
        setMeta(m);
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

  return { addons: meta.addons, tier: meta.tier, isLoading };
}

export type DashboardAddonKey = keyof DashboardAddons;
