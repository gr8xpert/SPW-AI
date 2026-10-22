'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { LayoutGrid, List, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageNumbers } from '@/components/ui/page-numbers';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { cn } from '@/lib/utils';
import { useBuyerText } from './_i18n/use-buyer-text';
import { useBuyerAgents, useBuyers, useBuyerSettings, useBuyerStages } from './use-buyers';
import { BuyerFilters, type BuyerFilterValues } from './_components/buyer-filters';
import { BuyerCard } from './_components/buyer-card';
import { BuyerTable } from './_components/buyer-table';
import { BuyerCreateDialog } from './_components/buyer-create-dialog';
import { BuyersNav } from './_components/buyers-nav';
import { ExportButton } from './_components/export-button';
import { useBuyerQuestions } from './use-buyer-follow-up';

const FILTER_KEYS = ['q', 'role', 'agentId', 'stageId', 'priority', 'source', 'stale', 'hot', 'answer', 'sort'] as const;
const PAGE_SIZE = 24;
const MANAGER_ROLES = new Set(['admin', 'webmaster', 'super_admin']);

function BuyersPageInner() {
  const t = useBuyerText();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: session } = useSession();

  // Filters, view and page live in the URL so a reload or a shared link
  // keeps them.
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, searchParams.get(k) ?? ''])) as BuyerFilterValues;
  const view = searchParams.get('view') === 'list' ? 'list' : 'cards';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const setQuery = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || (k === 'page' && v === 1)) next.delete(k);
      else next.set(k, String(v));
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const buyers = useBuyers({ ...filters, page, limit: PAGE_SIZE });
  const stages = useBuyerStages();
  const agents = useBuyerAgents();
  const settings = useBuyerSettings();
  const questions = useBuyerQuestions();
  const staleDays = settings.data?.staleDays ?? 14;
  const rows = buyers.data?.data ?? [];
  const total = buyers.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = FILTER_KEYS.some((k) => k !== 'sort' && filters[k]);
  const manager = MANAGER_ROLES.has(String(session?.user?.role ?? ''));

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.title}</h1>
          <p className="page-description mt-1">{t.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {(['cards', 'list'] as const).map((v) => (
              <Button
                key={v}
                variant="ghost"
                size="sm"
                className={cn('h-8 px-2.5', view === v && 'bg-muted')}
                onClick={() => setQuery({ view: v === 'cards' ? undefined : v })}
                aria-pressed={view === v}
              >
                {v === 'cards' ? <LayoutGrid className="mr-1.5 h-4 w-4" /> : <List className="mr-1.5 h-4 w-4" />}
                {v === 'cards' ? t.cards : t.list}
              </Button>
            ))}
          </div>
          {manager ? <ExportButton filters={filters} /> : null}
          <Button className="shadow-sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t.newBuyer}
          </Button>
        </div>
      </div>

      <BuyersNav />

      <BuyerFilters
        values={filters}
        onChange={(patch) => setQuery({ ...patch, page: undefined })}
        stages={stages.data ?? []}
        agents={agents.data ?? []}
        questions={questions.data ?? []}
      />

      {buyers.isError ? (
        <Card>
          <CardContent className="flex items-center justify-between p-6 text-sm">
            <span>{t.loadFailed}</span>
            <Button variant="outline" size="sm" onClick={() => buyers.refetch()}>
              {t.retry}
            </Button>
          </CardContent>
        </Card>
      ) : buyers.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {filtered ? t.noMatches : t.noBuyers}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.total(total)}</p>
          {view === 'cards' ? (
            <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', buyers.isFetching && 'opacity-70')}>
              {rows.map((b) => (
                <BuyerCard key={b.id} buyer={b} staleDays={staleDays} />
              ))}
            </div>
          ) : (
            <BuyerTable buyers={rows} staleDays={staleDays} />
          )}
          {pages > 1 ? <PageNumbers page={page} pages={pages} onChange={(p) => setQuery({ page: p })} /> : null}
        </>
      )}

      <BuyerCreateDialog open={createOpen} onOpenChange={setCreateOpen} agents={agents.data ?? []} />
    </div>
  );
}

export default function BuyersPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <BuyersPageInner />
    </LockedRouteGuard>
  );
}
