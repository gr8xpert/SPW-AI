'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Lock } from 'lucide-react';
import type { ApiKeyScope, ApiKeySummary } from '@spm/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/use-api';

type Stats = { count: number; views30d: number; enquiries30d: number };
interface ClientKeys {
  main: { last4: string } & Stats;
  keys: Array<ApiKeySummary & Stats>;
  total: number;
}

const LISTING_TYPES: Record<string, string> = { sale: 'Resale', development: 'New development', rent: 'Long-term rent', holiday_rent: 'Holiday rent' };

// The scope in words without the client's place names (they belong to the
// client; View as client shows them by name).
function describe(s: ApiKeyScope): string {
  const parts: string[] = [];
  if (s.locationIds?.length) parts.push(`${s.locationIds.length} place${s.locationIds.length > 1 ? 's' : ''}`);
  if (s.propertyTypeIds?.length) parts.push(`${s.propertyTypeIds.length} type${s.propertyTypeIds.length > 1 ? 's' : ''}`);
  if (s.listingTypes?.length) parts.push(s.listingTypes.map((t) => LISTING_TYPES[t] || t).join(', '));
  if (s.features?.length) parts.push(`${s.features.length} feature${s.features.length > 1 ? 's' : ''}`);
  if (s.priceMin || s.priceMax) parts.push(`${s.priceMin?.toLocaleString() ?? '0'}–${s.priceMax?.toLocaleString() ?? '∞'}`);
  if (s.ownOnly) parts.push('own listings only');
  if (s.featuredOnly) parts.push('featured only');
  return parts.join(' · ') || 'Everything';
}

// Super Admin → client → License: the client's extra website keys, read-only.
// Changes are made with View as client (Settings → API Keys).
export function ClientWebsiteKeys({ clientId }: { clientId: string }) {
  const api = useApi();
  const keys = useQuery({
    queryKey: ['admin', 'client-website-keys', clientId],
    queryFn: async () => {
      const res = (await api.get(`/api/super-admin/clients/${clientId}/api-keys`)) as { data?: ClientKeys } | ClientKeys;
      return ('data' in res && res.data ? res.data : res) as ClientKeys;
    },
    enabled: api.isReady && !!clientId,
  });
  const data = keys.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Website keys</CardTitle>
        <CardDescription>
          Extra keys this client made for other websites, each showing part of their listings. Read-only here — use View as client → Settings → API Keys to change them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {keys.isLoading || !data ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="rounded-lg border p-3 text-sm">
              <span className="font-medium">Main website</span>{' '}
              <code className="text-xs text-muted-foreground">spm_…{data.main.last4}</code>
              <p className="text-xs text-muted-foreground">
                Everything · {data.main.count.toLocaleString()} listings · {data.main.views30d.toLocaleString()} views · {data.main.enquiries30d} enquiries (30 days)
              </p>
            </div>
            {data.keys.length === 0 && <p className="text-sm text-muted-foreground">No website keys.</p>}
            {data.keys.map((k) => (
              <div key={k.id} className="rounded-lg border p-3 text-sm" data-testid={`admin-website-key-${k.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{k.name}</span>
                  <code className="text-xs text-muted-foreground">spm_…{k.last4}</code>
                  <Badge variant={k.isActive ? 'default' : 'secondary'}>{k.isActive ? 'on' : 'off'}</Badge>
                  {k.allowedDomains.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      {k.allowedDomains.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {describe(k.scope)} · {k.count.toLocaleString()} of {data.total.toLocaleString()} listings · {k.views30d.toLocaleString()} views · {k.enquiries30d} enquiries (30 days)
                </p>
                <p className="text-xs text-muted-foreground">
                  {k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleString()}${k.lastUsedOrigin ? ` on ${k.lastUsedOrigin}` : ''}` : 'Not used yet'}
                </p>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
