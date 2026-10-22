'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, Send, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageNumbers } from '@/components/ui/page-numbers';
import { PropertyRowsTable } from '@/components/property-rows-table';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import type { Buyer } from '../../use-buyers';
import { useAddSuggestions, useBuyerNearMisses, type NearMissItem } from '../../use-buyer-match';
import { useReasonText } from '../../_components/reason-text';
import { SendDialog } from './send-dialog';
import { RuleLines } from './ai/rule-lines';

// Listings that only just miss one must-have, with the reason.
export function NearMissesTab({ buyer }: { buyer: Buyer }) {
  const text = useBuyerText();
  const t = text.nearMisses;
  const m = text.matched;
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [all, setAll] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const list = useBuyerNearMisses(buyer.id, page, all);
  const add = useAddSuggestions(buyer.id);
  const words = useReasonText();

  const data = list.data;
  if (list.isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (list.isError || !data) {
    return (
      <Card><CardContent className="flex items-center justify-between p-6 text-sm">
        <span>{text.loadFailed}</span>
        <Button variant="outline" size="sm" onClick={() => list.refetch()}>{text.retry}</Button>
      </CardContent></Card>
    );
  }
  if (data.empty) return <Card><CardContent className="p-6 text-sm">{m.noWishlist}</CardContent></Card>;
  if (!data.enabled) return <Card><CardContent className="p-6 text-sm text-muted-foreground">{t.off}</CardContent></Card>;

  const addSelected = async () => {
    try {
      const res = await add.mutateAsync({ propertyIds: Array.from(selected) });
      toast({ title: m.added(res.added) });
      setSelected(new Set());
    } catch (err) {
      toast({ title: m.addFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };
  const pages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <Card data-testid="near-misses-tab">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.total(data.total)}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
        {data.hiddenCount > 0 || all ? (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
            {!all ? <span className="text-muted-foreground">{m.hiddenNote(data.hiddenCount)}</span> : null}
            <Button size="sm" variant="link" className="h-auto p-0" onClick={() => { setAll((v) => !v); setPage(1); setSelected(new Set()); }}>
              {all ? m.hideSent : m.showAll(data.hiddenCount)}
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
              <span className="text-sm text-muted-foreground">{m.selected(selected.size)}</span>
              <Button size="sm" disabled={!selected.size} onClick={() => setSendOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                {m.send}
              </Button>
              <Button size="sm" variant="outline" disabled={!selected.size || add.isPending} onClick={addSelected}>
                {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Star className="mr-2 h-4 w-4" />}
                {m.addToSuggested}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <PropertyRowsTable<NearMissItem>
                rows={data.data}
                columns={['image', 'reference', 'type', 'title', 'location', 'beds', 'baths', 'price', 'sizes']}
                headers={m.columns}
                noImage={m.noImage}
                titleExtra={(row) => (
                  <div className="mt-1 flex max-w-[280px] flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-miss={row.miss.code}>
                      <AlertTriangle className="h-3 w-3" />
                      {words.miss(row.miss, row.currency)}
                    </span>
                    {row.hiddenReason ? <Badge variant={row.hiddenReason === 'rejected' ? 'destructive' : 'outline'} className="h-5 px-1.5 text-[10px]">{m.hidden[row.hiddenReason]}</Badge> : null}
                    {(row.reasons ?? []).map((r, i) => <span key={i}>· {words.wish(r)}</span>)}
                    <RuleLines breaks={row.ruleBreaks} unknown={row.ruleUnknown} />
                  </div>
                )}
                selection={{ selected, onChange: setSelected }}
              />
            </div>
            {pages > 1 ? <div className="flex justify-end"><PageNumbers page={page} pages={pages} onChange={setPage} /></div> : null}
          </>
        )}
      </CardContent>
      <SendDialog buyer={buyer} propertyIds={Array.from(selected)} open={sendOpen} onOpenChange={setSendOpen} onSent={() => setSelected(new Set())} />
    </Card>
  );
}
