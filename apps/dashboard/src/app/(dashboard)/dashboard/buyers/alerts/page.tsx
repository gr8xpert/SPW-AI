'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Check, Loader2, RefreshCw, Send, TrendingDown, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PageNumbers } from '@/components/ui/page-numbers';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { formatRowPrice } from '@/components/property-rows-table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { BuyersNav } from '../_components/buyers-nav';
import { useBuyerSettings } from '../use-buyers';
import { nameOf, useBuyerAlerts, useDecideAlerts, useScanAlerts, type AlertItem, type AlertStatus } from '../use-buyer-match';

const MANAGERS = new Set(['admin', 'webmaster', 'super_admin']);
const STATUSES: AlertStatus[] = ['pending', 'approved', 'sent', 'rejected', 'skipped'];
const PAGE = 50;

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'EUR', maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}

// The agent's approval screen: every alert waits here until approved.
function AlertsInner() {
  const t = useBuyerText().alerts;
  const { toast } = useToast();
  const { data: session } = useSession();
  const manager = MANAGERS.has(String(session?.user?.role ?? ''));
  const settings = useBuyerSettings();
  const [status, setStatus] = useState<AlertStatus>('pending');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const list = useBuyerAlerts(status, page);
  const decide = useDecideAlerts();
  const scan = useScanAlerts();
  const cfg = settings.data?.alerts;

  const rows = list.data?.data ?? [];
  const groups: { buyer: AlertItem['buyer']; items: AlertItem[] }[] = [];
  for (const a of rows) {
    const g = groups.find((x) => x.buyer.id === a.buyer.id);
    if (g) g.items.push(a);
    else groups.push({ buyer: a.buyer, items: [a] });
  }

  const act = async (ids: number[], action: 'approve' | 'reject' | 'send_now') => {
    if (!ids.length) return;
    try {
      const res = await decide.mutateAsync({ ids, action });
      toast({ title: action === 'reject' ? t.rejected(res.updated) : t.approved(res.updated, res.sent) });
      setPicked(new Set());
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };
  const runScan = async () => {
    try {
      const res = await scan.mutateAsync();
      toast({ title: res.seeded ? t.seeded : t.scanned(res.alerts) });
    } catch (err) {
      toast({ title: t.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };
  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const open = status === 'pending' || status === 'approved';
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE));

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.description}</p>
        </div>
        {manager ? (
          <Button variant="outline" onClick={runScan} disabled={scan.isPending} data-testid="alerts-scan">
            {scan.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t.scan}
          </Button>
        ) : null}
      </div>
      <BuyersNav />
      {cfg && !cfg.enabled ? (
        <p className="rounded-md border bg-muted/40 p-3 text-sm">{t.off}</p>
      ) : cfg ? (
        <p className="text-sm text-muted-foreground">{cfg.delivery === 'instant' ? t.instant : t.digestAt(cfg.digestTime)}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={status === s ? 'default' : 'outline'}
            onClick={() => { setStatus(s); setPage(1); setPicked(new Set()); }}
            data-status={s}
          >
            {t.statuses[s]}
            {s === 'pending' && list.data?.pendingCount ? <span className="ml-1.5 tabular-nums">({list.data.pendingCount})</span> : null}
          </Button>
        ))}
      </div>

      {open && rows.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t.selected(picked.size)}</span>
          {status === 'pending' ? (
            <Button size="sm" variant="outline" disabled={!picked.size || decide.isPending} onClick={() => act(Array.from(picked), 'approve')} data-testid="bulk-approve">
              <Check className="mr-1 h-4 w-4" />
              {t.approve}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={!picked.size || decide.isPending} onClick={() => act(Array.from(picked), 'send_now')} data-testid="bulk-send">
            <Send className="mr-1 h-4 w-4" />
            {t.sendNow}
          </Button>
          {status === 'pending' ? (
            <>
              <Button size="sm" variant="ghost" className="text-destructive" disabled={!picked.size || decide.isPending} onClick={() => act(Array.from(picked), 'reject')}>
                <X className="mr-1 h-4 w-4" />
                {t.reject}
              </Button>
              <Button size="sm" className="ml-auto" disabled={decide.isPending} onClick={() => act(rows.map((r) => r.id), 'approve')} data-testid="approve-all">
                {t.approveAll(rows.length)}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {list.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !rows.length ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{t.empty[status]}</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.buyer.id} data-alert-buyer={g.buyer.id}>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
                  <Link href={`/dashboard/buyers/${g.buyer.id}?tab=suggested`} className="font-medium hover:underline">
                    {g.buyer.name || g.buyer.email || `#${g.buyer.id}`}
                  </Link>
                  <span className="text-muted-foreground">· {t.agent}: {g.buyer.agent ?? '—'}</span>
                </div>
                <ul className="divide-y">
                  {g.items.map((a) => {
                    const p = a.property;
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:flex-nowrap" data-alert={a.id}>
                        {open ? <Checkbox checked={picked.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={p?.reference ?? String(a.id)} /> : null}
                        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                          {p?.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={a.kind === 'price_drop' ? 'secondary' : 'outline'} className={cn('text-[10px]', a.kind === 'price_drop' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300')}>
                              {a.kind === 'price_drop' ? <TrendingDown className="mr-1 h-3 w-3" /> : null}
                              {t.kinds[a.kind]}
                            </Badge>
                            <span className="truncate font-medium">{p ? nameOf(p.title) || p.reference : '—'}</span>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {[p?.reference, nameOf(p?.location?.name)].filter(Boolean).join(' · ')}
                          </p>
                          <p className="text-xs font-medium">
                            {a.kind === 'price_drop' && a.oldPrice && a.newPrice
                              ? t.drop(money(a.oldPrice, p?.currency ?? 'EUR'), money(a.newPrice, p?.currency ?? 'EUR'))
                              : p ? formatRowPrice(p) : ''}
                          </p>
                        </div>
                        <span className="w-10 text-right text-xs font-semibold tabular-nums" title={t.score}>{a.score}</span>
                        {open ? (
                          <div className="flex gap-1">
                            {status === 'pending' ? (
                              <Button size="sm" variant="outline" onClick={() => act([a.id], 'approve')} disabled={decide.isPending} data-action="approve">
                                <Check className="h-4 w-4" />
                                <span className="sr-only sm:not-sr-only sm:ml-1">{t.approve}</span>
                              </Button>
                            ) : null}
                            <Button size="sm" variant="outline" onClick={() => act([a.id], 'send_now')} disabled={decide.isPending} data-action="send_now" title={t.sendNow}>
                              <Send className="h-4 w-4" />
                            </Button>
                            {status === 'pending' ? (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act([a.id], 'reject')} disabled={decide.isPending} data-action="reject" title={t.reject}>
                                <X className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t.statuses[a.status]}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
          {pages > 1 ? <div className="flex justify-end"><PageNumbers page={page} pages={pages} onChange={setPage} /></div> : null}
        </div>
      )}
    </div>
  );
}

export default function BuyerAlertsPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <AlertsInner />
    </LockedRouteGuard>
  );
}
