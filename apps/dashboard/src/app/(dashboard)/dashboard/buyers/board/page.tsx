'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Clock, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LockedRouteGuard } from '@/components/locked-route-guard';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { buyerName, daysSince, stageName, useBuyerAgents, useBuyerSettings, type BuyerListItem, type BuyerStage } from '../use-buyers';
import { useBuyerBoard, useBuyerQuestions, useMoveOnBoard } from '../use-buyer-follow-up';
import { BuyerFilters, type BuyerFilterValues } from '../_components/buyer-filters';
import { BuyersNav } from '../_components/buyers-nav';
import { BuyerAvatar, PriorityStars } from '../_components/buyer-bits';

const FILTER_KEYS = ['q', 'role', 'agentId', 'priority', 'source', 'stale', 'hot', 'answer'] as const;

// The click that ends a drag must not open the buyer.
let lastDragEnd = 0;

function BoardCard({ buyer, staleDays, dragging }: { buyer: BuyerListItem; staleDays: number; dragging?: boolean }) {
  const t = useBuyerText();
  const name = buyerName(buyer);
  const days = daysSince(buyer.lastActivityAt);
  const stale = buyer.stage?.kind === 'open' && days !== null && days >= staleDays;
  return (
    <Card className={cn('border-border/60 bg-background', dragging && 'rotate-2 shadow-lg')}>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <BuyerAvatar name={name} photoUrl={buyer.photoUrl} className="h-7 w-7" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
          <PriorityStars value={buyer.priority} />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate">{buyer.assignedToUser?.name || buyer.assignedToUser?.email || t.unassigned}</span>
          <span className={cn('flex shrink-0 items-center gap-1', stale && 'font-medium text-amber-600')}>
            <Clock className="h-3 w-3" />
            {days === null ? t.never : t.daysAgo(days)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DraggableCard({ buyer, stageId, staleDays }: { buyer: BuyerListItem; stageId: number; staleDays: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `buyer-${buyer.id}`, data: { buyer, from: stageId } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn('touch-none', isDragging && 'opacity-30')}>
      <Link
        href={`/dashboard/buyers/${buyer.id}`}
        draggable={false}
        className="block"
        onClick={(e) => {
          if (Date.now() - lastDragEnd < 300) e.preventDefault();
        }}
      >
        <BoardCard buyer={buyer} staleDays={staleDays} />
      </Link>
    </div>
  );
}

function Column({
  stage,
  total,
  buyers,
  staleDays,
}: {
  stage: BuyerStage;
  total: number;
  buyers: BuyerListItem[];
  staleDays: number;
}) {
  const t = useBuyerText();
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}`, data: { stageId: stage.id } });
  const color = stage.color || '#64748b';
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="truncate text-sm font-semibold">{stageName(stage)}</h3>
        <span className="ml-auto rounded-full bg-muted px-2 text-[11px] text-muted-foreground">{total}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn('min-h-[240px] flex-1 space-y-2 rounded-xl p-2 transition-colors', isOver ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/40')}
      >
        {buyers.map((b) => (
          <DraggableCard key={b.id} buyer={b} stageId={stage.id} staleDays={staleDays} />
        ))}
        {!buyers.length ? <p className="py-6 text-center text-xs text-muted-foreground">{t.board.empty}</p> : null}
        {total > buyers.length ? (
          <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">{t.board.more(total - buyers.length)}</p>
        ) : null}
      </div>
    </div>
  );
}

function BoardInner() {
  const t = useBuyerText();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, searchParams.get(k) ?? ''])) as Omit<BuyerFilterValues, 'stageId' | 'sort'>;
  const setQuery = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const board = useBuyerBoard(filters);
  const move = useMoveOnBoard(filters);
  const agents = useBuyerAgents();
  const questions = useBuyerQuestions();
  const settings = useBuyerSettings();
  const staleDays = settings.data?.staleDays ?? 14;
  const [active, setActive] = useState<BuyerListItem | null>(null);

  // A short drag threshold so a plain click still opens the buyer.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current?.buyer as BuyerListItem) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    lastDragEnd = Date.now();
    const from = e.active.data.current?.from as number | undefined;
    const to = e.over?.data.current?.stageId as number | undefined;
    const buyer = e.active.data.current?.buyer as BuyerListItem | undefined;
    if (!buyer || !from || !to || from === to) return;
    const stage = board.data?.stages.find((s) => s.id === to);
    move.mutate(
      { buyerId: buyer.id, from, to },
      {
        onSuccess: () => toast({ title: t.board.moved(stageName(stage)) }),
        onError: (err) => toast({ title: t.board.moveFailed, description: err.message, variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="page-header animate-fade-in">
        <div>
          <h1 className="page-title">{t.board.title}</h1>
          <p className="page-description mt-1">{t.board.description}</p>
        </div>
      </div>
      <BuyersNav />
      <BuyerFilters
        values={{ ...filters, stageId: '', sort: '' }}
        onChange={(patch) => setQuery(patch)}
        stages={[]}
        agents={agents.data ?? []}
        questions={questions.data ?? []}
        showSort={false}
        showStage={false}
      />

      {board.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : board.isError || !board.data ? (
        <Card>
          <CardContent className="flex items-center justify-between p-6 text-sm">
            <span>{t.loadFailed}</span>
            <Button variant="outline" size="sm" onClick={() => board.refetch()}>
              {t.retry}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {board.data.stages.map((s) => (
              <Column
                key={s.id}
                stage={s}
                total={board.data!.columns[s.id]?.total ?? 0}
                buyers={board.data!.columns[s.id]?.data ?? []}
                staleDays={staleDays}
              />
            ))}
          </div>
          <DragOverlay>{active ? <BoardCard buyer={active} staleDays={staleDays} dragging /> : null}</DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

export default function BuyerBoardPage() {
  const t = useBuyerText();
  return (
    <LockedRouteGuard addon="buyerMatch" featureName={t.featureName} description={t.featureDescription}>
      <BoardInner />
    </LockedRouteGuard>
  );
}
