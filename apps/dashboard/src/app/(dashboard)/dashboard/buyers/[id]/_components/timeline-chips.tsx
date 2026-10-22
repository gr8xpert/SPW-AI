'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useSuggestionEvent, useSuggestionTimeline, type AgentMark, type Suggestion } from '../../use-buyer-match';

// The steps a sent property goes through, in order. Liked and "Not for me"
// share a place: only one of them can be reached.
const STEPS = [
  { key: 'sent', at: (s: Suggestion) => s.sentAt },
  { key: 'opened', at: (s: Suggestion) => s.openedAt },
  { key: 'clicked', at: (s: Suggestion) => s.clickedAt },
  { key: 'reaction', at: (s: Suggestion) => s.likedAt || s.rejectedAt },
  { key: 'viewing', at: (s: Suggestion) => s.viewingAt },
  { key: 'offer', at: (s: Suggestion) => s.offerAt },
] as const;

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Sent → Opened → Clicked → Liked / Not for me → Viewing → Offer, with the
// date each was reached; the full event list opens below.
export function TimelineChips({ s }: { s: Suggestion }) {
  const t = useBuyerText().tracking;
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const mark = useSuggestionEvent();
  const events = useSuggestionTimeline(s.id, open);

  const doMark = async (event: AgentMark) => {
    let note: string | undefined;
    if (event === 'rejected') {
      const reason = window.prompt(t.reasonPrompt);
      if (reason === null) return;
      note = reason.trim() || undefined;
    }
    try {
      await mark.mutateAsync({ id: s.id, event, note });
    } catch (err) {
      toast({ title: t.markFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-1.5" data-testid="timeline">
      <div className="flex flex-wrap items-center gap-1">
        {STEPS.map((step, i) => {
          const at = step.at(s);
          const rejected = step.key === 'reaction' && !!s.rejectedAt;
          const label = step.key === 'reaction' ? (s.rejectedAt ? t.steps.rejected : t.steps.liked) : t.steps[step.key];
          return (
            <span key={step.key} className="flex items-center gap-1">
              {i > 0 ? <span className="text-muted-foreground/50">›</span> : null}
              <span
                data-step={step.key}
                data-reached={at ? 'yes' : 'no'}
                title={at ? `${label}: ${new Date(at).toLocaleString()}${step.key === 'opened' ? `\n${t.openedHint}` : ''}` : undefined}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4',
                  !at && 'border-dashed text-muted-foreground/70',
                  at && !rejected && 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
                  rejected && 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
                )}
              >
                {label}
                {at ? <span className="opacity-70">{day(at)}</span> : null}
              </span>
            </span>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-1.5" aria-label={t.mark} data-testid="timeline-mark" disabled={mark.isPending}>
              {mark.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreHorizontal className="h-3.5 w-3.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(['viewing', 'offer', 'liked', 'rejected', 'cleared'] as AgentMark[]).map((m) => (
              <DropdownMenuItem key={m} onSelect={() => void doMark(m)} data-mark={m}>
                {t.marks[m]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setOpen((v) => !v)} data-testid="timeline-toggle">
          {t.timeline}
          {open ? <ChevronUp className="ml-0.5 h-3 w-3" /> : <ChevronDown className="ml-0.5 h-3 w-3" />}
        </Button>
      </div>
      {s.rejectReason ? <p className="text-xs text-red-700 dark:text-red-400">{t.reason(s.rejectReason)}</p> : null}
      {open ? (
        <div className="rounded-md bg-muted/40 p-2 text-xs" data-testid="timeline-events">
          {events.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : !events.data?.length ? (
            <p className="text-muted-foreground">{t.noEvents}</p>
          ) : (
            <ol className="space-y-0.5">
              {events.data.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2">
                  <span className="tabular-nums text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</span>
                  <span className="font-medium">{t.events[e.event]}</span>
                  <span className="text-muted-foreground">
                    {e.user?.name ? e.user.name : t.sources[e.source]}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
