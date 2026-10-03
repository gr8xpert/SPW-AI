'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost } from '@/lib/api';
import type { CacheClearResponse, TenantCurrent } from './types';

// API Keys tab: last4 of the widget key (own endpoint) + rotate.
export function useApiKeySettings(accessToken: string | undefined) {
  const { toast } = useToast();
  const [apiKeyLast4, setApiKeyLast4] = useState<string | null>(null);
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [rotatingApiKey, setRotatingApiKey] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    apiGet<{ data: { apiKeyLast4: string } }>('/api/dashboard/tenant/api-credentials')
      .then((res) => {
        setApiKeyLast4(res.data?.apiKeyLast4 ?? null);
      })
      .catch(() => {});
  }, [accessToken]);

  const onRotateApiKey = async () => {
    const confirmed = window.confirm(
      'Regenerate your API key? The current key will stop working immediately. You must update your widget and any integrations with the new key.',
    );
    if (!confirmed) return;
    setRotatingApiKey(true);
    try {
      const res = await apiPost<{ data: { apiKey: string; apiKeyLast4: string } }>(
        '/api/dashboard/tenant/api-key/rotate',
      );
      setRevealedApiKey(res.data.apiKey);
      setApiKeyLast4(res.data.apiKeyLast4);
      toast({
        title: 'API key regenerated',
        description: 'Copy the new key now — it will not be shown again.',
      });
    } catch (err) {
      toast({
        title: 'Failed to regenerate API key',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setRotatingApiKey(false);
    }
  };

  return { apiKeyLast4, revealedApiKey, setRevealedApiKey, rotatingApiKey, onRotateApiKey };
}

export type ApiKeySettings = ReturnType<typeof useApiKeySettings>;

// Cache tab. Public widget + WP plugin read tenant.syncVersion to decide when
// to drop their local cache; bumping it on demand replaces the old PHP
// "clear cache" script operators used to run by hand.
export function useCacheSettings() {
  const { toast } = useToast();
  const [syncVersion, setSyncVersion] = useState<number | null>(null);
  const [lastClearedAt, setLastClearedAt] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);

  // Fills this tab from GET /api/dashboard/tenant (called by the page loader).
  const applyTenant = (res: TenantCurrent) => {
    if (typeof res.data?.syncVersion === 'number') {
      setSyncVersion(res.data.syncVersion);
    }
  };

  const onClearCache = async () => {
    if (clearingCache) return;
    const confirmed = window.confirm(
      'Clear widget cache now? Your site will refetch listings on the next request. This cannot be undone.',
    );
    if (!confirmed) return;

    setClearingCache(true);
    try {
      const res = await apiPost<CacheClearResponse>('/api/dashboard/tenant/cache/clear');
      setSyncVersion(res.data.syncVersion);
      setLastClearedAt(res.data.clearedAt);
      toast({
        title: 'Widget cache cleared',
        description: `New sync version: ${res.data.syncVersion}. Downstream widgets pick this up on their next poll.`,
      });
    } catch (err) {
      toast({
        title: 'Failed to clear cache',
        description: (err as Error).message || 'Unexpected error',
        variant: 'destructive',
      });
    } finally {
      setClearingCache(false);
    }
  };

  return { syncVersion, lastClearedAt, clearingCache, onClearCache, applyTenant };
}

export type CacheSettings = ReturnType<typeof useCacheSettings>;
