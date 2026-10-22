'use client';

import { useEffect, useState } from 'react';
import { FileDown, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatRowPrice } from '@/components/property-rows-table';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import type { Buyer } from '../../use-buyers';
import {
  nameOf,
  SUGGESTION_STATUSES,
  useAddSuggestions,
  useBuyerSuggestions,
  useRemoveSuggestion,
  useSuggestionsPdf,
  useUpdateSuggestion,
  type Suggestion,
} from '../../use-buyer-match';
import { SendDialog } from './send-dialog';
import { TimelineChips } from './timeline-chips';

// ISO from the API → the value a datetime-local input wants (local time).
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The agent's hand-picks for this buyer: notes, tour link, visit date and
// how far each got; sent by email or printed as one PDF.
export function SuggestedTab({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText().suggested;
  const text = useBuyerText();
  const { toast } = useToast();
  const list = useBuyerSuggestions(buyer.id);
  const add = useAddSuggestions(buyer.id);
  const pdf = useSuggestionsPdf(buyer.id);
  const [ref, setRef] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [sendIds, setSendIds] = useState<number[] | null>(null);

  const rows = list.data ?? [];
  const live = rows.filter((s) => s.property);

  const addRef = async () => {
    const refs = ref.split(/[\s,;]+/).map((r) => r.trim()).filter(Boolean);
    if (!refs.length) return;
    try {
      const res = await add.mutateAsync({ references: refs });
      if (res.notFound.length) toast({ title: t.notFound(res.notFound.join(', ')), variant: 'destructive' });
      else toast({ title: text.matched.added(res.added) });
      setRef('');
    } catch (err) {
      toast({ title: text.matched.addFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  const download = async (ids?: number[]) => {
    try {
      await pdf.mutateAsync({ lang: buyer.language?.slice(0, 2) || undefined, ids });
    } catch (err) {
      toast({ title: t.pdfFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = live.filter((s) => selected.has(s.propertyId)).map((s) => s.propertyId);

  return (
    <Card data-testid="suggested-tab">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t.tab}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="suggest-ref">{t.addByRef}</Label>
            <Input
              id="suggest-ref"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addRef();
              }}
              placeholder={t.refPlaceholder}
              className="h-9 w-[240px]"
            />
          </div>
          <Button size="sm" variant="outline" onClick={addRef} disabled={!ref.trim() || add.isPending}>
            {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t.add}
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" disabled={!live.length} onClick={() => setSendIds(chosen.length ? chosen : live.map((s) => s.propertyId))} data-testid="suggested-send">
              <Send className="mr-2 h-4 w-4" />
              {chosen.length ? t.send : t.sendAll}
            </Button>
            <Button size="sm" variant="outline" disabled={!live.length || pdf.isPending} onClick={() => download(chosen.length ? chosen : undefined)} data-testid="suggested-pdf">
              {pdf.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
              {chosen.length ? t.pdfSelected : t.pdf}
            </Button>
          </div>
        </div>

        {list.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !rows.length ? (
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <div className="divide-y rounded-md border">
            {rows.map((s) => (
              <SuggestionRow key={s.id} s={s} checked={selected.has(s.propertyId)} onToggle={() => toggle(s.propertyId)} />
            ))}
          </div>
        )}
      </CardContent>
      <SendDialog
        buyer={buyer}
        propertyIds={sendIds ?? []}
        open={!!sendIds}
        onOpenChange={(open) => !open && setSendIds(null)}
        onSent={() => setSelected(new Set())}
      />
    </Card>
  );
}

function SuggestionRow({ s, checked, onToggle }: { s: Suggestion; checked: boolean; onToggle: () => void }) {
  const t = useBuyerText().suggested;
  const { toast } = useToast();
  const update = useUpdateSuggestion();
  const remove = useRemoveSuggestion();
  const [note, setNote] = useState(s.note ?? '');
  const [tour, setTour] = useState(s.virtualTourUrl ?? '');
  const [visit, setVisit] = useState(toLocalInput(s.visitDate));
  useEffect(() => setNote(s.note ?? ''), [s.note]);
  useEffect(() => setTour(s.virtualTourUrl ?? ''), [s.virtualTourUrl]);
  useEffect(() => setVisit(toLocalInput(s.visitDate)), [s.visitDate]);
  const p = s.property;

  const save = async (patch: Parameters<typeof update.mutateAsync>[0]) => {
    try {
      await update.mutateAsync(patch);
    } catch (err) {
      toast({ title: t.saveFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };
  const saveTour = () => {
    const v = tour.trim();
    if (v === (s.virtualTourUrl ?? '')) return;
    if (v && !/^https?:\/\/\S+$/i.test(v)) {
      toast({ title: t.badUrl, variant: 'destructive' });
      return;
    }
    void save({ id: s.id, virtualTourUrl: v || null });
  };

  return (
    <div className="space-y-2 p-3" data-suggestion={p?.reference}>
    <div className="grid gap-3 md:grid-cols-[auto_88px_1fr_1.2fr]">
      <div className="pt-1">
        <Checkbox checked={checked} onCheckedChange={onToggle} disabled={!p} aria-label={p?.reference ?? String(s.propertyId)} />
      </div>
      <div className="h-16 w-[88px] overflow-hidden rounded-md bg-muted">
        {p?.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-mono text-xs text-muted-foreground">{p?.reference ?? `#${s.propertyId}`}</p>
        <p className="truncate font-medium">{p ? nameOf(p.title) || p.reference : '—'}</p>
        {p ? (
          <p className="text-muted-foreground">
            {[nameOf(p.location?.name), p.bedrooms ? t.beds(p.bedrooms) : '', formatRowPrice(p)].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{t.status}</Label>
          <Select value={s.status} onValueChange={(v) => v !== s.status && save({ id: s.id, status: v as Suggestion['status'] })}>
            <SelectTrigger className="h-8 w-full" aria-label={t.status}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUGGESTION_STATUSES.map((x) => (
                <SelectItem key={x} value={x}>
                  {t.statuses[x]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t.visit}</Label>
          <Input
            type="datetime-local"
            className="h-8"
            value={visit}
            onChange={(e) => {
              setVisit(e.target.value);
              void save({ id: s.id, visitDate: e.target.value ? new Date(e.target.value).toISOString() : null });
            }}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">{t.tour}</Label>
          <Input className="h-8" value={tour} onChange={(e) => setTour(e.target.value)} onBlur={saveTour} placeholder="https://" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">{t.note}</Label>
          <Textarea
            rows={2}
            value={note}
            placeholder={t.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (s.note ?? '') && save({ id: s.id, note })}
            maxLength={5000}
          />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(t.confirmRemove(p?.reference ?? String(s.propertyId)))) void remove.mutateAsync(s.id);
            }}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {t.remove}
          </Button>
        </div>
      </div>
    </div>
    {s.sentAt ? <TimelineChips s={s} /> : null}
    </div>
  );
}
