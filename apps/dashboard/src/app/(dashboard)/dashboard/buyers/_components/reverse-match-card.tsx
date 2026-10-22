'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Send, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useDashboardAddons } from '@/hooks/use-dashboard-addons';
import { useBuyerText } from '../_i18n/use-buyer-text';
import { useReverseMatch, useReverseSend } from '../use-buyer-match';

// On a property's edit page: "N buyers match this property", the list, and
// Send to all (the normal branded email, never twice). Buyer Match only.
export function ReverseMatchCard({ propertyId }: { propertyId: number }) {
  const { addons, known } = useDashboardAddons();
  const on = known && !!addons.buyerMatch;
  const words = useBuyerText();
  const t = words.reverse;
  const { toast } = useToast();
  const list = useReverseMatch(propertyId, on);
  const send = useReverseSend(propertyId);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  if (!on || !list.data) return null;
  const d = list.data;
  const sendable = d.buyers.filter((b) => !b.sent && !b.rejected);

  const run = async (ids?: number[]) => {
    try {
      const res = await send.mutateAsync(ids);
      const why = res.results.filter((r) => r.status !== 'sent').map((r) => t.reasons[r.reason ?? ''] ?? r.reason).filter(Boolean);
      toast({ title: t.done(res.sent, res.skipped, res.failed), description: why.length ? Array.from(new Set(why)).join(', ') : undefined });
      setPicked(new Set());
      setOpen(false);
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

  return (
    <Card data-testid="reverse-card">
      <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <Users className="h-4 w-4 text-muted-foreground" />
        {!d.property.live ? (
          <span className="text-muted-foreground">{t.notLive}</span>
        ) : (
          <>
            <span className="font-medium" data-testid="reverse-count">{t.count(d.total)}</span>
            {d.total ? <span className="text-muted-foreground">· {t.fresh(d.fresh)}</span> : null}
            {d.total ? (
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="reverse-open">{t.open}</Button>
                <Button size="sm" onClick={() => run()} disabled={!d.fresh || send.isPending} data-testid="reverse-send-all">
                  {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {t.sendAll(d.fresh)}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="reverse-dialog">
          <DialogHeader>
            <DialogTitle>{t.title} · {d.property.reference}</DialogTitle>
            <DialogDescription>{t.help}</DialogDescription>
          </DialogHeader>
          <div className="divide-y rounded-md border">
            {d.buyers.map((b) => {
              const done = b.sent || b.rejected;
              return (
                <label key={b.id} className="flex items-center gap-3 p-3 text-sm" data-buyer={b.id}>
                  <Checkbox checked={picked.has(b.id)} disabled={done} onCheckedChange={() => toggle(b.id)} aria-label={b.name ?? String(b.id)} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/buyers/${b.id}?tab=matched`} className="font-medium hover:underline">{b.name || b.email || `#${b.id}`}</Link>
                    <div className="text-xs text-muted-foreground">{t.agent}: {b.agent?.name ?? '—'}</div>
                  </div>
                  {b.rejected ? <Badge variant="destructive">{t.rejected}</Badge> : b.sent ? <Badge variant="outline">{t.sent}</Badge> : null}
                  <span className="w-12 text-right text-xs font-semibold tabular-nums" title={t.score}>{b.score}</span>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{words.send.cancel}</Button>
            <Button onClick={() => run(picked.size ? Array.from(picked) : undefined)} disabled={send.isPending || (!picked.size && !sendable.length)} data-testid="reverse-dialog-send">
              {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {picked.size ? t.sendSelected(picked.size) : t.sendAll(sendable.length)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
