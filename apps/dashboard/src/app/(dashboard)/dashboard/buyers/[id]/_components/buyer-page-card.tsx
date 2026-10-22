'use client';

import { Copy, ExternalLink, Loader2, Power, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerPage, useBuyerPageAction } from '../../use-buyer-match';

// The buyer's private page: its link, where it opens, on/off, a new link.
export function BuyerPageCard({ buyerId }: { buyerId: number }) {
  const t = useBuyerText().page;
  const { toast } = useToast();
  const page = useBuyerPage(buyerId);
  const act = useBuyerPageAction(buyerId);
  const s = page.data;

  const run = async (action: 'create' | 'enable' | 'disable' | 'renew') => {
    if (action === 'renew' && !window.confirm(t.confirmRenew)) return;
    try {
      await act.mutateAsync(action);
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };
  const copy = async () => {
    if (!s?.url) return;
    try {
      await navigator.clipboard.writeText(s.url);
      toast({ title: t.copied });
    } catch {
      window.prompt(t.copy, s.url);
    }
  };

  return (
    <Card data-testid="buyer-page-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {t.title}
          {s?.hasCode ? <Badge variant={s.enabled ? 'secondary' : 'outline'}>{s.enabled ? t.on : t.offBadge}</Badge> : null}
        </CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {page.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : !s?.hasCode ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t.none}</span>
            <Button size="sm" variant="outline" onClick={() => run('create')} disabled={act.isPending} data-testid="page-create">
              {t.create}
            </Button>
          </div>
        ) : (
          <>
            {s.enabled && s.url ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs" data-testid="page-url">{s.url}</code>
                  <Button size="sm" variant="outline" onClick={copy}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {t.copy}
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      {t.open}
                    </a>
                  </Button>
                </div>
                {s.via ? <p className="text-xs text-muted-foreground" data-testid="page-via">{t.via[s.via]}</p> : null}
              </div>
            ) : (
              <p className="text-muted-foreground" data-testid="page-off">{t.off}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => run(s.enabled ? 'disable' : 'enable')} disabled={act.isPending} data-testid="page-toggle">
                <Power className="mr-1 h-3.5 w-3.5" />
                {s.enabled ? t.disable : t.enable}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run('renew')} disabled={act.isPending} data-testid="page-renew">
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                {t.renew}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
