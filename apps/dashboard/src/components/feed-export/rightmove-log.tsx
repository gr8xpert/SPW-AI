'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, FlaskConical, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiGet } from '@/lib/api';
import { errorText, unwrap } from './idealista-api';
import type { RightmoveLogs } from './rightmove-api';

const ACTION: Record<string, string> = { send: 'Sent', remove: 'Removed', list: 'Checked list' };

// The last Rightmove calls, and the listings Rightmove has from SPM.
export function RightmoveLog({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const [data, setData] = useState<RightmoveLogs | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(unwrap(await apiGet('/api/dashboard/feed-export/rightmove/logs')));
    } catch (err) {
      toast({ title: 'Could not load the log', description: errorText(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Last 100 calls to Rightmove (kept 30 days).</p>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>
      {!data.logs.length ? (
        <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
      ) : (
        <div className="border rounded-md divide-y max-h-[360px] overflow-y-auto">
          {data.logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 p-2 text-sm">
              {l.dryRun ? (
                <FlaskConical className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              ) : l.success ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">
                    {l.dryRun ? 'Dry run' : ACTION[l.action]} {l.agentRef}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(l.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-muted-foreground break-words">{l.message}</p>
                {[...(l.errors || []), ...(l.warnings || [])].map((m, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    {m.code}: {m.description}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!!data.listings.length && (
        <>
          <p className="text-sm font-medium">On Rightmove ({data.listings.length})</p>
          <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
            {data.listings.map((l) => (
              <div key={l.agentRef} className="flex items-center justify-between gap-3 p-2 text-sm">
                {l.propertyId ? (
                  <a href={`/dashboard/properties/${l.propertyId}/edit`} className="font-medium hover:underline">{l.agentRef}</a>
                ) : (
                  <span className="font-medium">{l.agentRef}</span>
                )}
                <span className="flex items-center gap-2 text-muted-foreground">
                  {l.lastPushedAt && new Date(l.lastPushedAt).toLocaleDateString()}
                  {l.rightmoveUrl && (
                    <a href={l.rightmoveUrl} target="_blank" rel="noopener noreferrer" title="Open on Rightmove">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
