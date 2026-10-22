'use client';

import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerChanges, type ChangeEntry } from '../../use-buyer-match';
import { useBuyerQuestions } from '../../use-buyer-follow-up';
import { nameOf } from '../../use-buyer-match';

const PAGE = 50;

function humanize(field: string): string {
  return field.replace(/^wishlist\./, '').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

// The change log: who changed what, when, from → to.
export function HistoryTab({ buyerId }: { buyerId: number }) {
  const text = useBuyerText();
  const t = text.history;
  const [page, setPage] = useState(1);
  const changes = useBuyerChanges(buyerId, page);
  const questions = useBuyerQuestions();

  const fieldName = (field: string) => {
    if (field.startsWith('answers.')) {
      const key = field.slice(8);
      const q = questions.data?.find((x) => x.qkey === key);
      return t.answer(q ? nameOf(q.label) : humanize(key));
    }
    return t.fields[field] ?? humanize(field);
  };
  const who = (e: ChangeEntry) => (e.source === 'dashboard' ? e.user?.name || '—' : t.by[e.source] ?? e.source);

  if (changes.isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (changes.isError) {
    return (
      <Card><CardContent className="flex items-center justify-between p-6 text-sm">
        <span>{text.loadFailed}</span>
        <Button variant="outline" size="sm" onClick={() => changes.refetch()}>{text.retry}</Button>
      </CardContent></Card>
    );
  }
  const rows = changes.data?.data ?? [];
  const total = changes.data?.total ?? 0;

  return (
    <Card data-testid="history-tab">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.tab}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <ol className="divide-y rounded-md border">
            {rows.map((e) => (
              <li key={e.id} className="grid gap-2 p-3 text-sm sm:grid-cols-[180px_1fr]" data-change={e.id}>
                <div className="text-muted-foreground">
                  <div className="font-medium text-foreground">{who(e)}</div>
                  <div className="tabular-nums text-xs">{new Date(e.createdAt).toLocaleString()}</div>
                </div>
                <ul className="space-y-1">
                  {e.changes.map((c, i) =>
                    c.field === 'created' ? (
                      <li key={i} className="font-medium">
                        {t.created} {c.to ? t.createdFrom[c.to] ?? '' : ''}
                      </li>
                    ) : (
                      <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{fieldName(c.field)}</span>
                        <span className="break-all text-muted-foreground line-through decoration-1">{c.from ?? t.empty_value}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 self-center text-muted-foreground" />
                        <span className="break-all">{c.to ?? <span className="text-muted-foreground">{t.empty_value}</span>}</span>
                      </li>
                    ),
                  )}
                </ul>
              </li>
            ))}
          </ol>
        )}
        {total > PAGE ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t.newer}</Button>
            <Button size="sm" variant="outline" disabled={page * PAGE >= total} onClick={() => setPage((p) => p + 1)}>{t.older}</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
