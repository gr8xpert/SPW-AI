'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet, apiPost } from '@/lib/api';

type Status = 'ok' | 'warning' | 'error' | 'info';
interface ClientRow {
  tenantId: number;
  name: string;
  overall: Status;
  problems: Array<{ status: Status; title: string }>;
  published: number;
  views7d: number;
  leadsWaiting: number;
  website: { url: string; lastSeenAt: string; pluginVersion: string | null } | null;
  feeds: Array<{ name: string; status: Status; lastSyncAt: string | null }>;
}
interface PlatformState {
  checkedAt: string | null;
  checks: Record<string, { label: string; ok: boolean; detail: string; failingSince: string | null }>;
}

const ICON: Record<Status, JSX.Element> = {
  ok: <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />,
  error: <XCircle className="h-4 w-4 shrink-0 text-red-600" />,
  info: <Info className="h-4 w-4 shrink-0 text-sky-600" />,
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function ClientHealthPage() {
  const { data: session } = useSession();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiGet<{ data: ClientRow[] }>('/api/super-admin/website-health').then((r) => setRows(r.data)),
      apiGet<{ data: PlatformState }>('/api/super-admin/website-health/platform').then((r) => setPlatform(r.data)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (session?.accessToken) load();
  }, [session?.accessToken, load]);

  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await apiPost<{ data: PlatformState }>('/api/super-admin/website-health/platform/check');
      setPlatform(r.data);
    } finally {
      setChecking(false);
    }
  };

  const counts = rows ? { error: rows.filter((r) => r.overall === 'error').length, warning: rows.filter((r) => r.overall === 'warning').length } : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Client Health</h1>
          <p className="text-muted-foreground">The platform and every client&apos;s website, feeds and enquiries — problems first.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Platform</CardTitle>
            <CardDescription>Checked every 5 minutes; you get an email when a check fails twice in a row, and when it recovers.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={checkNow} disabled={checking}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Check now
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {platform && Object.keys(platform.checks).length ? (
            <>
              {Object.entries(platform.checks).map(([id, c]) => (
                <div key={id} className="flex items-center gap-2" data-testid={`platform-${id}`}>
                  {ICON[c.ok ? 'ok' : 'error']}
                  <span className="font-medium">{c.label}</span>
                  <span className="text-muted-foreground">{c.detail}{c.failingSince ? ` — failing since ${when(c.failingSince)}` : ''}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Last check {when(platform.checkedAt)}</p>
            </>
          ) : (
            <p className="text-muted-foreground">No check has run yet — click Check now.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients</CardTitle>
          {counts && (
            <CardDescription>
              {rows!.length} clients · {counts.error} with problems · {counts.warning} needing attention
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Client</th>
                  <th className="py-2 pr-3 font-medium">Needs attention</th>
                  <th className="py-2 pr-3 font-medium">Website</th>
                  <th className="py-2 pr-3 font-medium">Feeds</th>
                  <th className="py-2 pr-3 font-medium text-right">Live</th>
                  <th className="py-2 pr-3 font-medium text-right">Views 7d</th>
                  <th className="py-2 font-medium text-right">Waiting leads</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tenantId} className="border-b align-top last:border-0" data-testid="client-row">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2 font-medium">{ICON[r.overall]} {r.name}</div>
                    </td>
                    <td className="py-2 pr-3">
                      {r.problems.length ? (
                        <ul className="space-y-0.5">
                          {r.problems.slice(0, 4).map((p, i) => (
                            <li key={i} className="flex items-center gap-1">{ICON[p.status]} {p.title}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.website ? (
                        <>
                          <a className="hover:underline" href={r.website.url} target="_blank" rel="noreferrer">{r.website.url.replace(/^https?:\/\//, '')}</a>
                          <div className="text-xs text-muted-foreground">seen {when(r.website.lastSeenAt)}{r.website.pluginVersion ? ` · v${r.website.pluginVersion}` : ''}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">not connected</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.feeds.length ? r.feeds.map((f) => (
                        <div key={f.name} className="flex items-center gap-1">{ICON[f.status]} {f.name} <span className="text-xs text-muted-foreground">{when(f.lastSyncAt)}</span></div>
                      )) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">{r.published}</td>
                    <td className="py-2 pr-3 text-right">{r.views7d}</td>
                    <td className="py-2 text-right">{r.leadsWaiting}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
