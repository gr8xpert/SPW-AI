'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useApi } from '@/hooks/use-api';
import { useTenantQueryScope } from '@/hooks/use-tenant-query-scope';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BuyersNav } from '../_components/buyers-nav';
import { FilterSelect } from '../_components/filter-select';
import { one } from '../use-buyers';

interface Report {
  months: string[];
  sources: string[];
  series: Record<string, string | number>[];
  funnel: { stages: { stageId: number; name: string; count: number }[]; won: number; lost: number };
  agents: { agentId: number | null; name: string | null; buyers: number; won: number; lost: number; wonValue: number; conversion: number | null; medianResponseHours: number | null }[];
  expectedRevenue: number;
  openValue: number;
  probabilities: { stageId: number; name: string; probability: number }[];
}

// Each source keeps its own colour whatever the filter (categorical slots of
// the validated reference palette, in a fixed order); anything else is grey.
const SOURCE_SLOT: Record<string, number> = { website: 1, widget_inquiry: 2, email: 3, phone: 4, referral: 5, walkin: 6, facebook: 7, instagram: 8 };
const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#8a8a85'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767', '#7a7a75'],
};

// SVG attributes can't read CSS variables, so the chart gets real colours
// for the current theme (and follows a theme switch).
function useChartColors() {
  const read = () => {
    const dark = document.documentElement.classList.contains('dark');
    const css = getComputedStyle(document.documentElement);
    const hsl = (name: string, fallback: string) => (css.getPropertyValue(name).trim() ? `hsl(${css.getPropertyValue(name).trim()})` : fallback);
    return {
      series: dark ? SERIES.dark : SERIES.light,
      surface: hsl('--card', dark ? '#0f172a' : '#ffffff'),
      grid: hsl('--border', dark ? '#334155' : '#e2e8f0'),
      ink: hsl('--muted-foreground', '#64748b'),
    };
  };
  const [colors, setColors] = useState(() => (typeof document === 'undefined' ? { series: SERIES.light, surface: '#ffffff', grid: '#e2e8f0', ink: '#64748b' } : read()));
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}
const colorOf = (series: string[], source: string) => series[(SOURCE_SLOT[source] ?? 9) - 1];

const money = (n: number) => new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en', { month: 'short', year: '2-digit' });

const VIZ_CSS = `
.buyer-report { --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a; --series-4:#eda100; --series-5:#e87ba4; --series-6:#008300; --series-7:#6250d6; --series-8:#e34948; --series-other:#8a8a85; --viz-surface: hsl(var(--card)); }
.dark .buyer-report { --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; --series-4:#c98500; --series-5:#d55181; --series-6:#008300; --series-7:#9085e9; --series-8:#e66767; --series-other:#7a7a75; }
`;

function Stat({ label, value, hint, testid }: { label: string; value: string; hint?: string; testid: string }) {
  return (
    <Card data-testid={testid}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function ReportsInner() {
  const t = useBuyerText();
  const r = t.reports;
  const api = useApi();
  const { scope, ready } = useTenantQueryScope();
  const [months, setMonths] = useState('12');
  const report = useQuery({
    queryKey: ['buyers', 'reports', ...scope, months] as const,
    queryFn: async () => one<Report>(await api.get(`/api/dashboard/buyers/reports?months=${months}`)),
    enabled: ready && api.isReady,
  });
  const [table, setTable] = useState(false);
  const colors = useChartColors();
  const d = report.data;
  const sourceName = (s: string) => t.sources[s as keyof typeof t.sources] ?? s;
  const newBuyers = d ? d.series.reduce((sum, m) => sum + d.sources.reduce((a, s) => a + Number(m[s] ?? 0), 0), 0) : 0;
  const top = d?.funnel.stages[0]?.count || 1;

  return (
    <div className="buyer-report space-y-6">
      <style>{VIZ_CSS}</style>
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{r.title}</h1>
          <p className="page-description mt-1">{r.description}</p>
        </div>
        <FilterSelect className="w-40" value={months} onChange={(v) => setMonths(v || '12')} anyLabel={r.months(12)}
          options={[3, 6, 12, 24].map((n) => ({ value: String(n), label: r.months(n) }))} />
      </div>
      <BuyersNav />

      {report.isLoading || !d ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat testid="stat-new" label={r.newBuyers} value={String(newBuyers)} hint={r.inMonths(d.months.length)} />
            <Stat testid="stat-won" label={r.won} value={String(d.funnel.won)} hint={r.lostHint(d.funnel.lost)} />
            <Stat testid="stat-pipeline" label={r.openValue} value={money(d.openValue)} />
            <Stat testid="stat-expected" label={r.expected} value={money(d.expectedRevenue)} hint={r.expectedHint} />
          </div>

          <Card data-testid="report-sources">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
              <div>
                <CardTitle className="text-sm">{r.bySource}</CardTitle>
                <CardDescription>{r.bySourceHint}</CardDescription>
              </div>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTable((x) => !x)}>
                {table ? r.showChart : r.showTable}
              </button>
            </CardHeader>
            <CardContent>
              {!d.sources.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{r.none}</p>
              ) : table ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{r.month}</TableHead>
                      {d.sources.map((s) => <TableHead key={s} className="text-right">{sourceName(s)}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.series.map((m) => (
                      <TableRow key={String(m.month)}>
                        <TableCell>{monthLabel(String(m.month))}</TableCell>
                        {d.sources.map((s) => <TableCell key={s} className="text-right tabular-nums">{m[s]}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid vertical={false} stroke={colors.grid} />
                      <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} fontSize={12} tick={{ fill: colors.ink }} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} tick={{ fill: colors.ink }} />
                      <Tooltip
                        cursor={{ fill: colors.grid, opacity: 0.4 }}
                        labelFormatter={(m) => monthLabel(String(m))}
                        formatter={(v, name) => [v as number, sourceName(String(name))]}
                        contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--popover-foreground))' }}
                      />
                      <Legend formatter={(v) => <span className="text-xs text-foreground">{sourceName(String(v))}</span>} iconType="circle" iconSize={8} />
                      {d.sources.map((s, i) => (
                        <Bar key={s} dataKey={s} stackId="src" fill={colorOf(colors.series, s)} stroke={colors.surface} strokeWidth={2} maxBarSize={36}
                          radius={i === d.sources.length - 1 ? [4, 4, 0, 0] : 0} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="report-funnel">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{r.funnel}</CardTitle>
                <CardDescription>{r.funnelHint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {d.funnel.stages.map((s) => (
                  <div key={s.stageId} className="grid grid-cols-[120px_1fr_48px] items-center gap-2 text-sm" title={`${s.name}: ${s.count}`}>
                    <span className="truncate text-muted-foreground">{s.name}</span>
                    <div className="h-5 rounded-r bg-muted/50">
                      <div className="h-5 rounded-r" style={{ width: `${Math.max(1, (s.count / top) * 100)}%`, background: 'var(--series-1)' }} />
                    </div>
                    <span className="text-right tabular-nums">{s.count}</span>
                  </div>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">{r.wonLost(d.funnel.won, d.funnel.lost)}</p>
              </CardContent>
            </Card>

            <Card data-testid="report-probabilities">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{r.probabilities}</CardTitle>
                <CardDescription>{r.probabilitiesHint}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                {d.probabilities.map((p) => (
                  <div key={p.stageId} className="contents">
                    <span className="text-muted-foreground">{p.name}</span>
                    <span className="text-right tabular-nums">{p.probability}%</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card data-testid="report-agents">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{r.agents}</CardTitle>
              <CardDescription>{r.agentsHint}</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{r.agent}</TableHead>
                    <TableHead className="text-right">{r.buyers}</TableHead>
                    <TableHead className="text-right">{r.wonCol}</TableHead>
                    <TableHead className="text-right">{r.lostCol}</TableHead>
                    <TableHead className="text-right">{r.wonValue}</TableHead>
                    <TableHead className="text-right">{r.conversion}</TableHead>
                    <TableHead className="text-right">{r.response}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.agents.map((a) => (
                    <TableRow key={a.agentId ?? 'none'}>
                      <TableCell>{a.name ?? t.unassigned}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.buyers}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.won}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.lost}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.wonValue ? money(a.wonValue) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.conversion === null ? '—' : `${a.conversion}%`}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.medianResponseHours === null ? '—' : r.hours(a.medianResponseHours)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function BuyerReportsPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <ReportsInner />
    </LockedRouteGuard>
  );
}
