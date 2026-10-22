'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Loader2, PlugZap, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { buyerKeys, one } from '../../use-buyers';

interface MetaSettings {
  pageId: string | null;
  pageName: string | null;
  enabled: boolean;
  hasToken: boolean;
  lastLeadAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  imported: number;
}

// Settings → Facebook & Instagram (milestone K, managers): connect the
// agency's Facebook Page; lead-form leads become buyers every 15 minutes.
export function MetaSettingsCard({ canEdit }: { canEdit: boolean }) {
  const m = useBuyerText().meta;
  const api = useApi();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { scope, ready } = useTenantQueryScope();
  const key = ['buyers', 'meta', ...scope] as const;
  const data = useQuery({ queryKey: key, queryFn: async () => one<MetaSettings>(await api.get('/api/dashboard/buyers/meta')), enabled: ready && api.isReady && canEdit });
  const [pageId, setPageId] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => {
    if (data.data) setPageId(data.data.pageId ?? '');
  }, [data.data]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['buyers', 'meta'] });
  const fail = (e: Error) => toast({ title: m.failed, description: e.message, variant: 'destructive' });

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => one<MetaSettings>(await api.put('/api/dashboard/buyers/meta', body)),
    onSuccess: () => {
      setToken('');
      toast({ title: m.saved });
      void refresh();
    },
    onError: fail,
  });
  const test = useMutation({
    mutationFn: async () => one<{ pageName: string; forms: number }>(await api.post('/api/dashboard/buyers/meta/test')),
    onSuccess: (r) => {
      toast({ title: m.connected(r.pageName, r.forms) });
      void refresh();
    },
    onError: (e: Error) => {
      fail(e);
      void refresh();
    },
  });
  const importNow = useMutation({
    mutationFn: async () => one<{ imported: number }>(await api.post('/api/dashboard/buyers/meta/import')),
    onSuccess: (r) => {
      toast({ title: m.importedNow(r.imported) });
      void refresh();
      void queryClient.invalidateQueries({ queryKey: buyerKeys.all });
    },
    onError: (e: Error) => {
      fail(e);
      void refresh();
    },
  });

  if (!canEdit) return null;
  const d = data.data;
  const when = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');

  return (
    <div className="max-w-3xl space-y-6">
      <Card data-testid="meta-settings">
        <CardHeader>
          <CardTitle className="text-base">{m.title}</CardTitle>
          <CardDescription>{m.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.isLoading || !d ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="meta-page">{m.pageId}</Label>
                  <Input id="meta-page" inputMode="numeric" value={pageId} maxLength={30} onChange={(e) => setPageId(e.target.value.replace(/\D/g, ''))} placeholder="102938475610" />
                  <p className="text-xs text-muted-foreground">{m.pageIdHint}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-token">{m.token}</Label>
                  <Input id="meta-token" type="password" autoComplete="off" value={token} maxLength={1000} onChange={(e) => setToken(e.target.value)} placeholder={d.hasToken ? m.tokenKept : m.tokenPaste} />
                  <p className="text-xs text-muted-foreground">{m.tokenHint}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={save.isPending || !pageId || (!token && pageId === (d.pageId ?? ''))}
                  onClick={() => save.mutate({ pageId, ...(token ? { accessToken: token } : {}) })}
                  data-testid="meta-save"
                >
                  {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {m.save}
                </Button>
                <Button variant="outline" disabled={!d.hasToken || test.isPending} onClick={() => test.mutate()} data-testid="meta-test">
                  {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                  {m.test}
                </Button>
                <Button variant="outline" disabled={!d.hasToken || importNow.isPending} onClick={() => importNow.mutate()} data-testid="meta-import">
                  {importNow.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {m.importNow}
                </Button>
                {d.hasToken ? (
                  <Button variant="ghost" className="text-destructive" onClick={() => window.confirm(m.disconnectConfirm) && save.mutate({ accessToken: null, enabled: false })}>
                    {m.disconnect}
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch id="meta-on" checked={d.enabled} disabled={!d.hasToken || save.isPending} onCheckedChange={(on) => save.mutate({ enabled: on })} data-testid="meta-enabled" />
                <Label htmlFor="meta-on">{m.enabled}</Label>
              </div>
              <div className="grid gap-1 text-sm sm:grid-cols-[180px_1fr]" data-testid="meta-status">
                <span className="text-muted-foreground">{m.page}</span>
                <span className="flex items-center gap-1.5">
                  {d.pageName ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                  {d.pageName ?? m.notTested}
                </span>
                <span className="text-muted-foreground">{m.lastRun}</span>
                <span>{when(d.lastRunAt)}</span>
                <span className="text-muted-foreground">{m.newest}</span>
                <span>{when(d.lastLeadAt)}</span>
                <span className="text-muted-foreground">{m.imported}</span>
                <span className="tabular-nums">{d.imported}</span>
                {d.lastError ? (
                  <>
                    <span className="text-muted-foreground">{m.lastError}</span>
                    <span className="flex items-start gap-1.5 text-destructive" data-testid="meta-error">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {d.lastError}
                    </span>
                  </>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{m.howTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            {m.how.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
