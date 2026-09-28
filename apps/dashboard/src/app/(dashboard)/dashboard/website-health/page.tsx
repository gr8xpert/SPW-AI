'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AlertTriangle, CheckCircle2, Globe, Info, Loader2, RefreshCw, Upload, Building2, Inbox, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';

type Status = 'ok' | 'warning' | 'error' | 'info';
interface Check {
  id: string;
  area: 'feeds' | 'website' | 'listings' | 'leads';
  status: Status;
  title: string;
  detail: string;
  action?: { label: string; href: string };
}
interface Feed {
  id: number;
  name: string;
  provider: string;
  isActive: boolean;
  status: Status;
  lastSyncAt: string | null;
  lastRun: { startedAt: string; status: string; fetched: number; created: number; updated: number; removed: number; errors: number; errorSamples: Array<{ ref: string; error: string }> } | null;
}
interface Report {
  generatedAt: string;
  overall: Status;
  checks: Check[];
  feeds: Feed[];
  sites: Array<{ siteUrl: string; source: 'plugin' | 'widget'; pluginVersion: string | null; lastSeenAt: string; status: Status }>;
  activity: { views7d: number; searches7d: number; lastViewAt: string | null };
  listings: { published: number };
  leads: { new7d: number; waiting: number };
}

const ICON: Record<Status, JSX.Element> = {
  ok: <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />,
  warning: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />,
  error: <XCircle className="h-5 w-5 shrink-0 text-red-600" />,
  info: <Info className="h-5 w-5 shrink-0 text-sky-600" />,
};
const AREAS: Array<{ id: Check['area']; title: string; icon: JSX.Element }> = [
  { id: 'website', title: 'Your website', icon: <Globe className="h-4 w-4" /> },
  { id: 'feeds', title: 'Property feeds', icon: <Upload className="h-4 w-4" /> },
  { id: 'listings', title: 'Listings', icon: <Building2 className="h-4 w-4" /> },
  { id: 'leads', title: 'Enquiries', icon: <Inbox className="h-4 w-4" /> },
];
const BANNER: Record<Status, { text: string; cls: string }> = {
  ok: { text: 'Everything is working', cls: 'border-green-200 bg-green-50 text-green-800' },
  info: { text: 'Everything is working', cls: 'border-green-200 bg-green-50 text-green-800' },
  warning: { text: 'A few things need your attention', cls: 'border-amber-200 bg-amber-50 text-amber-900' },
  error: { text: 'Something is not working', cls: 'border-red-200 bg-red-50 text-red-800' },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

export default function WebsiteHealthPage() {
  const { data: session } = useSession();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiGet<{ data: Report }>('/api/dashboard/website-health')
      .then((res) => setReport(res.data))
      .catch((err) => setError((err as Error).message || 'Could not load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (session?.accessToken) load();
  }, [session?.accessToken, load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Website Health</h1>
          <p className="text-muted-foreground">Is everything working? Your website, feeds, listings and enquiries at a glance.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Check again
        </Button>
      </div>

      {error && <Card className="border-destructive/40"><CardContent className="py-4 text-sm text-destructive">{error}</CardContent></Card>}

      {report && (
        <>
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${BANNER[report.overall].cls}`} data-testid="health-banner">
            {ICON[report.overall]}
            <div>
              <div className="font-semibold">{BANNER[report.overall].text}</div>
              <div className="text-sm opacity-80">
                {report.listings.published} properties live · {report.activity.views7d} property views and {report.leads.new7d} enquiries in the last 7 days
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {AREAS.map((area) => {
              const items = report.checks.filter((c) => c.area === area.id);
              if (!items.length) return null;
              return (
                <Card key={area.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">{area.icon} {area.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {items.map((c) => (
                      <div key={c.id} className="flex gap-3" data-testid={`check-${c.status}`}>
                        {ICON[c.status]}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{c.title}</div>
                          <div className="text-sm text-muted-foreground">{c.detail}</div>
                        </div>
                        {c.action && (
                          <Button asChild variant="outline" size="sm" className="shrink-0">
                            <Link href={c.action.href}>{c.action.label}</Link>
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {report.feeds.some((f) => f.lastRun) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Last feed imports</CardTitle>
                <CardDescription>What each feed brought in the last time it ran.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Feed</th>
                      <th className="py-2 pr-4 font-medium">Ran</th>
                      <th className="py-2 pr-4 font-medium">Received</th>
                      <th className="py-2 pr-4 font-medium">New</th>
                      <th className="py-2 pr-4 font-medium">Updated</th>
                      <th className="py-2 pr-4 font-medium">Removed</th>
                      <th className="py-2 font-medium">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.feeds.filter((f) => f.lastRun).map((f) => (
                      <tr key={f.id} className="border-b align-top last:border-0">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">{ICON[f.status]} <span className="font-medium">{f.name}</span></div>
                          {f.lastRun!.errorSamples.length > 0 && (
                            <details className="mt-1 text-xs text-muted-foreground">
                              <summary className="cursor-pointer">Show errors</summary>
                              <ul className="mt-1 space-y-1">
                                {f.lastRun!.errorSamples.map((e, i) => (
                                  <li key={i}><span className="font-mono">{e.ref}</span>: {e.error}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{when(f.lastRun!.startedAt)}</td>
                        <td className="py-2 pr-4">{f.lastRun!.fetched}</td>
                        <td className="py-2 pr-4">{f.lastRun!.created}</td>
                        <td className="py-2 pr-4">{f.lastRun!.updated}</td>
                        <td className="py-2 pr-4">{f.lastRun!.removed}</td>
                        <td className="py-2">{f.lastRun!.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {report.sites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Websites showing your properties</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {report.sites.map((s) => (
                  <div key={`${s.siteUrl}-${s.source}`} className="flex flex-wrap items-center gap-2">
                    {ICON[s.status]}
                    <a href={s.siteUrl} target="_blank" rel="noreferrer" className="font-medium hover:underline">{s.siteUrl.replace(/^https?:\/\//, '')}</a>
                    <span className="text-muted-foreground">
                      {s.source === 'plugin' ? `WordPress plugin${s.pluginVersion ? ` v${s.pluginVersion}` : ''}` : 'widget'} · last seen {when(s.lastSeenAt)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">Checked {when(report.generatedAt)}. A summary of this page is emailed every Monday (Settings → Email).</p>
        </>
      )}
      {loading && !report && (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>
      )}
    </div>
  );
}
