'use client';

import Link from 'next/link';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { useBuyerText } from '../../../_i18n/use-buyer-text';
import type { Buyer } from '../../../use-buyers';
import { useBuyerSummary, useRefreshSummary } from '../../../use-buyer-ai';
import { AI_SETTINGS_URL, useAiFailure } from './ai-gate';

// Three lines at the top of the record, so anyone can pick up the buyer.
// Written by the API when missing or stale; cached until the buyer changes.
export function SummaryCard({ buyer }: { buyer: Buyer }) {
  const ai = useBuyerText().ai;
  const t = ai.summary;
  const summary = useBuyerSummary(buyer.id);
  const refresh = useRefreshSummary(buyer.id);
  const failure = useAiFailure();
  if (buyer.erasedAt) return null;
  const data = summary.data;
  const busy = summary.isFetching || refresh.isPending;

  return (
    <Card data-testid="ai-summary" className="border-primary/20 bg-primary/[0.03]">
      <CardContent className="flex gap-3 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          {data?.lines?.length ? (
            <>
              {data.lines.map((line, i) => (
                <p key={i} className="break-words" data-summary-line={i}>{line}</p>
              ))}
              <p className="text-xs text-muted-foreground">
                {data.stale ? t.stale : data.at ? t.written(formatDate(data.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : null}
              </p>
            </>
          ) : busy ? (
            <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t.writing}</p>
          ) : data && !data.hasKey ? (
            <p className="text-muted-foreground" data-testid="ai-summary-no-key">
              {t.noKey}{' '}
              <Link href={AI_SETTINGS_URL} className="font-medium text-primary hover:underline">{ai.openSettings}</Link>
            </p>
          ) : summary.isError ? (
            <p className="text-muted-foreground">{t.failed}</p>
          ) : (
            <p className="text-muted-foreground">{t.empty}</p>
          )}
        </div>
        {data?.hasKey ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label={t.refresh}
            title={t.refresh}
            disabled={busy}
            onClick={() => refresh.mutate(undefined, { onError: failure.notify })}
            data-testid="ai-summary-refresh"
          >
            <RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        ) : null}
        {failure.dialog}
      </CardContent>
    </Card>
  );
}
