'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { useBuyerAgents, useBuyers, useBuyerSettings } from '../use-buyers';
import { endOfToday, useDueTasks } from '../use-buyer-follow-up';
import { BuyersNav } from '../_components/buyers-nav';
import { BuyerCard } from '../_components/buyer-card';
import { FilterSelect } from '../_components/filter-select';
import { TaskRow } from '../_components/task-row';

const MANAGERS = new Set(['admin', 'webmaster', 'super_admin']);

function TodayInner() {
  const t = useBuyerText();
  const { data: session } = useSession();
  const canPick = MANAGERS.has(String(session?.user?.role ?? ''));
  const agents = useBuyerAgents();
  const settings = useBuyerSettings();
  const me = agents.data?.find((a) => a.email === session?.user?.email);
  const [picked, setPicked] = useState('');
  const agentId = picked ? Number(picked) : undefined;
  // Computed once per visit; the page is reloaded the next day anyway.
  const before = useMemo(() => endOfToday(), []);
  const due = useDueTasks(before, agentId);

  // Overdue = its deadline has passed (also earlier today); the rest is due later today.
  const now = Date.now();
  const overdue = (due.data ?? []).filter((x) => x.dueAt && new Date(x.dueAt).getTime() < now);
  const today = (due.data ?? []).filter((x) => x.dueAt && new Date(x.dueAt).getTime() >= now);

  // My stale buyers: the agent whose list this is (when known).
  const staleFor = agentId ?? me?.id;
  const stale = useBuyers({ stale: 'true', agentId: staleFor ? String(staleFor) : undefined, limit: 12 });
  const staleDays = settings.data?.staleDays ?? 14;

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.today.title}</h1>
          <p className="page-description mt-1">{t.today.description}</p>
        </div>
        {canPick ? (
          <div className="flex items-center gap-2">
            <Label className="text-sm">{t.today.agent}</Label>
            <FilterSelect
              value={picked}
              onChange={setPicked}
              anyLabel={t.today.me}
              className="w-56"
              options={(agents.data ?? []).filter((a) => a.id !== me?.id).map((a) => ({ value: String(a.id), label: a.name || a.email }))}
            />
          </div>
        ) : null}
      </div>
      <BuyersNav />

      <Card>
        <CardContent className="space-y-6 p-6">
          {due.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !overdue.length && !today.length ? (
            <p className="text-sm text-muted-foreground">{t.today.nothing}</p>
          ) : (
            <>
              {overdue.length ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold text-destructive">
                    {t.today.overdue} ({overdue.length})
                  </h2>
                  {overdue.map((task) => (
                    <TaskRow key={task.id} task={task} showBuyer />
                  ))}
                </section>
              ) : null}
              {today.length ? (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">
                    {t.today.dueToday} ({today.length})
                  </h2>
                  {today.map((task) => (
                    <TaskRow key={task.id} task={task} showBuyer />
                  ))}
                </section>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t.today.stale}</CardTitle>
          <CardDescription>{t.today.staleHelp(staleDays)}</CardDescription>
        </CardHeader>
        <CardContent>
          {stale.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : !stale.data?.data.length ? (
            <p className="text-sm text-muted-foreground">{t.today.noStale}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stale.data.data.map((b) => (
                <BuyerCard key={b.id} buyer={b} staleDays={staleDays} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BuyersTodayPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <TodayInner />
    </LockedRouteGuard>
  );
}
