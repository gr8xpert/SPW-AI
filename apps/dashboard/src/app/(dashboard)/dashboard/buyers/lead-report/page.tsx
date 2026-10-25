'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Download, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageNumbers } from '@/components/ui/page-numbers';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BuyersNav } from '../_components/buyers-nav';
import { FilterSelect } from '../_components/filter-select';
import { LEAD_SOURCES, stageName, useBuyerAgents, useBuyerSettings, useBuyerStages } from '../use-buyers';
import { useBuyerQuestions } from '../use-buyer-follow-up';
import { useLeadReportText } from './_i18n';
import { AgentSummary } from './_components/agent-summary';
import { ColumnPicker } from './_components/column-picker';
import { ReportTable } from './_components/report-table';
import { reportQuery, useLeadReport, useLeadReportSummary, type LeadReportParams } from './use-lead-report';

const MANAGER_ROLES = new Set(['admin', 'webmaster', 'super_admin']);
const PAGE_SIZE = 50;
const PERIODS = { d7: 7, d30: 30, d90: 90, all: 0 } as const;
type Period = keyof typeof PERIODS;
const STATUSES = ['not_contacted', 'overdue', 'tried', 'reached'] as const;

// Start of the local day `days` ago, as ISO: the same all day, so the query
// key doesn't change on every render.
function periodFrom(period: Period): string | undefined {
  const days = PERIODS[period];
  if (!days) return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function LeadReportInner() {
  const t = useLeadReportText();
  const bt = useBuyerText();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const manager = MANAGER_ROLES.has(String(session?.user?.role ?? ''));
  const api = useApi();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const get = (k: string) => searchParams.get(k) ?? '';
  const period = (get('period') in PERIODS ? get('period') : 'd30') as Period;
  const page = Math.max(1, Number(get('page')) || 1);
  // The latest URL, so a delayed write (search) never puts back old filters.
  const latest = useRef(searchParams);
  latest.current = searchParams;
  const setQuery = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(latest.current.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in patch)) next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Search waits for a pause in typing. `written` is the last search put in
  // the URL (the URL itself may lag behind in a router update).
  const [q, setQ] = useState(get('q'));
  const written = useRef(get('q'));
  useEffect(() => {
    if (q === written.current) return;
    const id = setTimeout(() => {
      written.current = q;
      setQuery({ q });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const from = useMemo(() => periodFrom(period), [period]);
  const params: LeadReportParams = {
    q: get('q'), agentId: get('agentId'), stageId: get('stageId'), source: get('source'), status: get('status'),
    sort: get('sort'), from, page, limit: PAGE_SIZE,
  };
  const report = useLeadReport(params);
  const summary = useLeadReportSummary(params);
  const stages = useBuyerStages();
  const agents = useBuyerAgents();
  const settings = useBuyerSettings();
  const questions = useBuyerQuestions();
  const picked = useMemo(() => settings.data?.reportQuestions ?? [], [settings.data]);
  // The picked Buyer questions that still exist, in the settings' order.
  const reportQuestions = useMemo(
    () => picked.map((k) => (questions.data ?? []).find((q) => q.qkey === k)).filter((q): q is NonNullable<typeof q> => !!q),
    [picked, questions.data],
  );
  const rows = report.data?.data ?? [];
  const total = report.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = ['q', 'agentId', 'stageId', 'source', 'status'].some((k) => get(k));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { page: _p, limit: _l, ...filters } = params;
      const res = await api.getRaw(`/api/dashboard/buyers/lead-report.csv${reportQuery(filters)}`);
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'lead-report.csv';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      toast({ title: t.saveFailed, description: (err as Error).message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{manager ? t.description : t.descriptionAgent}</p>
        </div>
        {manager ? (
          <div className="flex items-center gap-2">
            <ColumnPicker questions={questions.data ?? []} picked={picked} />
            <Button variant="outline" onClick={exportCsv} disabled={exporting} data-testid="lead-report-export">
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {t.export}
            </Button>
          </div>
        ) : null}
      </div>

      <BuyersNav />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="h-9 w-[240px] pl-8" data-testid="lead-report-search" />
        </div>
        <FilterSelect
          value={period === 'd30' ? '' : period}
          onChange={(v) => setQuery({ period: v || undefined })}
          anyLabel={t.period.d30}
          options={(['d7', 'd90', 'all'] as const).map((p) => ({ value: p, label: t.period[p] }))}
        />
        <FilterSelect
          value={get('status')}
          onChange={(v) => setQuery({ status: v })}
          anyLabel={t.allStatuses}
          options={STATUSES.map((s) => ({ value: s, label: t.statusFilter[s] }))}
          className="w-[190px]"
        />
        {manager ? (
          <FilterSelect
            value={get('agentId')}
            onChange={(v) => setQuery({ agentId: v })}
            anyLabel={t.allAgents}
            options={[...(agents.data ?? []).map((a) => ({ value: String(a.id), label: a.name || a.email })), { value: '0', label: t.nobody }]}
          />
        ) : null}
        <FilterSelect
          value={get('stageId')}
          onChange={(v) => setQuery({ stageId: v })}
          anyLabel={t.allStages}
          options={(stages.data ?? []).map((s) => ({ value: String(s.id), label: stageName(s) }))}
        />
        <FilterSelect
          value={get('source')}
          onChange={(v) => setQuery({ source: v })}
          anyLabel={t.allSources}
          options={LEAD_SOURCES.map((s) => ({ value: s, label: bt.sources[s] ?? s }))}
        />
        <FilterSelect
          value={get('sort')}
          onChange={(v) => setQuery({ sort: v })}
          anyLabel={t.sortNewest}
          options={[{ value: 'oldest', label: t.sortOldest }]}
          className="w-[150px]"
        />
      </div>

      {summary.data ? (
        <AgentSummary
          agents={summary.data.agents}
          totals={summary.data.totals}
          overdueHours={summary.data.overdueHours}
          manager={manager}
          onPick={(agentId, status) => {
            written.current = '';
            setQ('');
            setQuery({ agentId: agentId === null ? undefined : agentId, status: status ?? undefined, q: undefined, stageId: undefined, source: undefined });
          }}
        />
      ) : null}

      {report.isError ? (
        <Card>
          <CardContent className="flex items-center justify-between p-6 text-sm">
            <span>{t.loadFailed}</span>
            <Button variant="outline" size="sm" onClick={() => report.refetch()}>{t.retry}</Button>
          </CardContent>
        </Card>
      ) : report.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">{filtered ? t.noMatches : t.empty}</CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="lead-report-total">{t.total(total)}</p>
          <div className={report.isFetching ? 'opacity-70' : undefined}>
            <ReportTable rows={rows} stages={stages.data ?? []} agents={agents.data ?? []} questions={reportQuestions} manager={manager} booking={!!report.data?.booking} />
          </div>
          {pages > 1 ? <PageNumbers page={page} pages={pages} onChange={(p) => setQuery({ page: p })} /> : null}
        </>
      )}
    </div>
  );
}

export default function LeadReportPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <LeadReportInner />
    </LockedRouteGuard>
  );
}
