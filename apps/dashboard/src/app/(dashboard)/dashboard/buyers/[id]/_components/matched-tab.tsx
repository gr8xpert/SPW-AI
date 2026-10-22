'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Loader2, Send, Star, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageNumbers } from '@/components/ui/page-numbers';
import { PropertyRowsTable } from '@/components/property-rows-table';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import type { Buyer } from '../../use-buyers';
import { nameOf, useAddSuggestions, useBuyerMatches, useMatchOptions, type MatchItem } from '../../use-buyer-match';
import { SendDialog } from './send-dialog';
import { useReasonText } from '../../_components/reason-text';
import { RuleLines } from './ai/rule-lines';

// Words for a wish key: bedrooms / buildSize / feature:12.
export function useWishLabel() {
  const t = useBuyerText().matched;
  const features = useMatchOptions('features');
  return (key: string) => {
    if (key.startsWith('feature:')) {
      const id = Number(key.slice(8));
      return nameOf(features.data?.find((f) => f.id === id)?.name) || `${t.feature} #${id}`;
    }
    return t.keys[key] ?? key;
  };
}

function scoreClass(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
  if (score >= 50) return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  return 'bg-muted text-muted-foreground';
}

// The wishlist run as a live search over the website listings.
export function MatchedTab({ buyer }: { buyer: Buyer }) {
  const text = useBuyerText();
  const t = text.matched;
  const { toast } = useToast();
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [all, setAll] = useState(false);
  const matches = useBuyerMatches(buyer.id, page, true, all);
  const add = useAddSuggestions(buyer.id);
  const wish = useWishLabel();
  const words = useReasonText();

  const addSelected = async () => {
    try {
      const res = await add.mutateAsync({ propertyIds: Array.from(selected) });
      toast({ title: t.added(res.added) });
      setSelected(new Set());
    } catch (err) {
      toast({ title: t.addFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  const data = matches.data;
  if (matches.isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (matches.isError) {
    return (
      <Card><CardContent className="flex items-center justify-between p-6 text-sm">
        <span>{text.loadFailed}</span>
        <Button variant="outline" size="sm" onClick={() => matches.refetch()}>{text.retry}</Button>
      </CardContent></Card>
    );
  }
  if (!data || data.empty) {
    return (
      <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-6 text-sm">
        <span>{t.noWishlist}</span>
        <Button size="sm" asChild><Link href={`${pathname}?tab=wishlist`}>{t.openWishlist}</Link></Button>
      </CardContent></Card>
    );
  }

  const pages = Math.max(1, Math.ceil(Math.min(data.total, 500) / data.limit));
  return (
    <Card data-testid="matched-tab">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.total(data.total)}</CardTitle>
        <CardDescription>
          {t.description} {data.capped ? t.capped(500) : null}
        </CardDescription>
        {data.hiddenCount > 0 || all ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
            {!all ? <span className="text-muted-foreground" data-testid="matched-hidden-note">{t.hiddenNote(data.hiddenCount)}</span> : null}
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0"
              data-testid="matched-show-all"
              onClick={() => {
                setAll((v) => !v);
                setPage(1);
                setSelected(new Set());
              }}
            >
              {all ? t.hideSent : t.showAll(data.hiddenCount)}
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.data.length ? (
          <p className="text-sm text-muted-foreground">{t.none}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{t.selected(selected.size)}</span>
              <Button size="sm" disabled={!selected.size} onClick={() => setSendOpen(true)} data-testid="matched-send">
                <Send className="mr-2 h-4 w-4" />
                {t.send}
              </Button>
              <Button size="sm" variant="outline" disabled={!selected.size || add.isPending} onClick={addSelected} data-testid="matched-add">
                {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />}
                {t.addToSuggested}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <PropertyRowsTable<MatchItem>
                rows={data.data}
                columns={['image', 'reference', 'type', 'title', 'location', 'beds', 'baths', 'price', 'sizes']}
                headers={t.columns}
                noImage={t.noImage}
                titleExtra={(row) => (
                  <div className="mt-1 flex max-w-[260px] flex-wrap gap-x-2 gap-y-0.5">
                    {row.hiddenReason ? (
                      <Badge variant={row.hiddenReason === 'rejected' ? 'destructive' : 'outline'} className="h-5 px-1.5 text-[10px]" data-hidden={row.hiddenReason}>
                        {t.hidden[row.hiddenReason]}
                      </Badge>
                    ) : row.suggested ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{t.suggested}</Badge> : null}
                    {row.met.map((k) => (
                      <span key={k} className="inline-flex items-center gap-0.5 text-xs text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" />{wish(k)}</span>
                    ))}
                    {(row.reasons ?? []).map((r, i) => (
                      <span key={i} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" data-reason={r.code}><X className="h-3 w-3" />{words.wish(r)}</span>
                    ))}
                    <RuleLines breaks={row.ruleBreaks} unknown={row.ruleUnknown} />
                  </div>
                )}
                selection={{ selected, onChange: setSelected }}
                extra={[
                  {
                    key: 'score',
                    header: t.score,
                    cell: (row) => (
                      <span className={cn('inline-flex min-w-[44px] justify-center rounded-full px-2 py-0.5 text-xs font-semibold', scoreClass(row.score))} data-score={row.score}>
                        {row.score}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
            {pages > 1 ? (
              <div className="flex justify-end">
                <PageNumbers page={page} pages={pages} onChange={setPage} />
              </div>
            ) : null}
          </>
        )}
      </CardContent>
      <SendDialog buyer={buyer} propertyIds={Array.from(selected)} open={sendOpen} onOpenChange={setSendOpen} onSent={() => setSelected(new Set())} />
    </Card>
  );
}
