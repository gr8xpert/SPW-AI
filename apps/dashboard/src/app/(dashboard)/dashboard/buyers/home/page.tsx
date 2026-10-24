'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AlertTriangle, Bell, CalendarClock, Flame, Loader2, MessageCircleReply, CheckSquare, PhoneMissed } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BuyersNav } from '../_components/buyers-nav';
import { FilterSelect } from '../_components/filter-select';
import { useBuyerAgents, useBuyerSettings } from '../use-buyers';
import { nameOf } from '../use-buyer-match';
import { useBuyerHome, useMyDigest, useSetMyDigest } from '../use-buyer-viewings';
import { dashboardLocale } from '@/i18n/i18n-provider';
import { useLeadReportText } from '../lead-report/_i18n';

const MANAGERS = new Set(['admin', 'webmaster', 'super_admin']);

function when(iso: string) {
  return new Date(iso).toLocaleString(dashboardLocale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Section({ title, icon: Icon, count, children, testid }: { title: string; icon: typeof Bell; count?: number; children: React.ReactNode; testid: string }) {
  return (
    <Card data-testid={testid}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {count ? <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{count}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

// An agent's day: their pipeline, tasks, viewings, buyers waiting for a
// reply, hot buyers and alerts to approve. Managers can pick an agent.
function HomeInner() {
  const t = useBuyerText();
  const h = t.home;
  const lr = useLeadReportText();
  const overdueHours = useBuyerSettings().data?.firstContactHours ?? 24;
  const { toast } = useToast();
  const { data: session } = useSession();
  const manager = MANAGERS.has(String(session?.user?.role ?? ''));
  const agents = useBuyerAgents();
  const [agentId, setAgentId] = useState('');
  const home = useBuyerHome(agentId ? Number(agentId) : undefined);
  const digest = useMyDigest();
  const setDigest = useSetMyDigest();
  const d = home.data;
  const empty = <p className="text-muted-foreground">{h.none}</p>;
  const buyerLink = (id: number, label: string, tab?: string) => (
    <Link href={`/dashboard/buyers/${id}${tab ? `?tab=${tab}` : ''}`} className="font-medium text-primary hover:underline">{label}</Link>
  );

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{h.title}</h1>
          <p className="page-description mt-1">{h.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {manager ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{h.agent}</span>
              <FilterSelect className="w-52" value={agentId} onChange={setAgentId} anyLabel={session?.user?.name || '—'}
                options={(agents.data ?? []).filter((a) => String(a.email) !== session?.user?.email).map((a) => ({ value: String(a.id), label: a.name || a.email }))} />
            </div>
          ) : null}
          {!agentId ? (
            <div className="flex items-center gap-2 text-sm" title={h.digest}>
              <Switch
                id="my-digest"
                checked={digest.data?.on !== false}
                disabled={!digest.data || setDigest.isPending}
                onCheckedChange={async (on) => {
                  try {
                    await setDigest.mutateAsync(on);
                  } catch (err) {
                    toast({ title: t.loadFailed, description: (err as Error).message, variant: 'destructive' });
                  }
                }}
                data-testid="digest-switch"
              />
              <label htmlFor="my-digest">{digest.data?.on === false ? h.digestOff : h.digestOn}</label>
            </div>
          ) : null}
        </div>
      </div>
      <BuyersNav />

      {home.isLoading || !d ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <Card data-testid="home-pipeline">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{h.pipeline}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {d.pipeline.length ? d.pipeline.map((p) => (
                <Link key={p.stageId ?? 'none'} href={`/dashboard/buyers?stageId=${p.stageId ?? ''}${agentId ? `&agentId=${agentId}` : ''}`}
                  className="flex min-w-[120px] flex-col rounded-md border px-3 py-2 hover:bg-muted/50">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color || '#94a3b8' }} />
                    {nameOf(p.name) || '—'}
                  </span>
                  <span className="text-xl font-semibold tabular-nums">{p.count}</span>
                </Link>
              )) : empty}
            </CardContent>
          </Card>

          {d.alertsToApprove ? (
            <Link href="/dashboard/buyers/alerts" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" data-testid="home-alerts">
              <Bell className="h-4 w-4" />
              {h.alerts(d.alertsToApprove)}
            </Link>
          ) : null}

          {d.notContacted?.length ? (
            <Section title={lr.homeTitle(overdueHours)} icon={PhoneMissed} count={d.notContacted.length} testid="home-not-contacted">
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">{d.notContacted.map((n) => (
                <li key={n.buyerId}>{buyerLink(n.buyerId, n.buyer)}<span className="ml-1.5 text-xs text-red-600">{h.since(n.since)}</span></li>
              ))}</ul>
              <Link href={`/dashboard/buyers/lead-report?status=overdue${agentId ? `&agentId=${agentId}` : ''}`} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">{lr.homeOpen}</Link>
            </Section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={h.overdue} icon={AlertTriangle} count={d.overdueTasks.length} testid="home-overdue">
              {d.overdueTasks.length ? (
                <ul className="space-y-1.5">{d.overdueTasks.map((x) => (
                  <li key={x.id} className="flex flex-wrap gap-x-2"><span className="text-red-600 tabular-nums">{when(x.dueAt)}</span>{x.title} · {buyerLink(x.buyerId, x.buyer, 'tasks')}</li>
                ))}</ul>
              ) : empty}
            </Section>
            <Section title={h.today} icon={CheckSquare} count={d.todayTasks.length} testid="home-today">
              {d.todayTasks.length ? (
                <ul className="space-y-1.5">{d.todayTasks.map((x) => (
                  <li key={x.id} className="flex flex-wrap gap-x-2"><span className="tabular-nums text-muted-foreground">{new Date(x.dueAt).toLocaleTimeString(dashboardLocale(), { hour: '2-digit', minute: '2-digit' })}</span>{x.title} · {buyerLink(x.buyerId, x.buyer, 'tasks')}</li>
                ))}</ul>
              ) : empty}
            </Section>
            <Section title={h.viewings} icon={CalendarClock} count={d.viewings.length} testid="home-viewings">
              {d.viewings.length ? (
                <ul className="space-y-1.5">{d.viewings.map((v) => (
                  <li key={v.id} className="flex flex-wrap gap-x-2">
                    <span className="tabular-nums text-muted-foreground">{when(v.startsAt)}</span>
                    <span>{v.property ? `${v.property.reference} — ${nameOf(v.property.title) || ''}` : v.title}</span>
                    · {buyerLink(v.leadId, v.buyer?.name || '—', 'visit')}
                  </li>
                ))}</ul>
              ) : empty}
            </Section>
            <Section title={h.waiting} icon={MessageCircleReply} count={d.waiting.length} testid="home-waiting">
              {d.waiting.length ? (
                <ul className="space-y-1.5">{d.waiting.map((w) => (
                  <li key={w.buyerId}>{buyerLink(w.buyerId, w.buyer, 'activity')}{w.since ? <span className="ml-2 text-xs text-muted-foreground">{h.since(w.since)}</span> : null}</li>
                ))}</ul>
              ) : empty}
            </Section>
            <Section title={h.hot} icon={Flame} count={d.hot.length} testid="home-hot">
              {d.hot.length ? (
                <ul className="space-y-1.5">{d.hot.map((x) => (
                  <li key={x.buyerId}>{buyerLink(x.buyerId, x.buyer, 'suggested')}<span className="ml-2 text-xs text-muted-foreground">{h.score} {x.score}</span></li>
                ))}</ul>
              ) : empty}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

export default function BuyerHomePage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <HomeInner />
    </LockedRouteGuard>
  );
}
