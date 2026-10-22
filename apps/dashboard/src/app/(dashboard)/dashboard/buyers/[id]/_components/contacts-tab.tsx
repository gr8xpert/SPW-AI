'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useUpdateBuyer, type Buyer, type RelatedContact } from '../../use-buyers';

const blank = (): RelatedContact => ({ name: '', relation: '', email: '', phone: '' });

export function ContactsTab({ buyer }: { buyer: Buyer }) {
  const t = useBuyerText();
  const r = t.record.related;
  const { toast } = useToast();
  const update = useUpdateBuyer(buyer.id);
  const [rows, setRows] = useState<RelatedContact[]>(buyer.relatedContacts ?? []);
  useEffect(() => setRows(buyer.relatedContacts ?? []), [buyer.relatedContacts]);

  const dirty = JSON.stringify(rows) !== JSON.stringify(buyer.relatedContacts ?? []);
  const valid = rows.every((x) => x.name.trim());

  const setRow = (i: number, key: keyof RelatedContact, value: string) =>
    setRows((list) => list.map((x, j) => (j === i ? { ...x, [key]: value } : x)));

  const save = async () => {
    const clean = rows.map((x) => {
      const out: RelatedContact = { name: x.name.trim() };
      for (const k of ['relation', 'email', 'phone'] as const) if (x[k]?.trim()) out[k] = x[k]!.trim();
      return out;
    });
    try {
      await update.mutateAsync({ relatedContacts: clean });
      toast({ title: t.record.saved });
    } catch (err) {
      toast({ title: t.record.saveFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{r.title}</CardTitle>
        <CardDescription>{r.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{r.empty}</p> : null}
        {rows.map((row, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr_1fr_auto]">
            <Input placeholder={`${r.name} *`} value={row.name} maxLength={150} onChange={(e) => setRow(i, 'name', e.target.value)} />
            <Input placeholder={r.relation} value={row.relation ?? ''} maxLength={100} onChange={(e) => setRow(i, 'relation', e.target.value)} />
            <Input placeholder={r.email} value={row.email ?? ''} maxLength={255} onChange={(e) => setRow(i, 'email', e.target.value)} />
            <Input placeholder={r.phone} value={row.phone ?? ''} maxLength={50} onChange={(e) => setRow(i, 'phone', e.target.value)} />
            <Button variant="ghost" size="icon" title={r.remove} onClick={() => setRows((list) => list.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" disabled={rows.length >= 20} onClick={() => setRows((list) => [...list, blank()])}>
            <Plus className="mr-1 h-4 w-4" />
            {r.add}
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || !valid || update.isPending}>
            {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.record.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
