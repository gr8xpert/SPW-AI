'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiPut } from '@/lib/api';
import { errorText, type IdealistaTypeOption, type IdealistaTypeRow } from './idealista-api';

const AUTO = '__auto';

// Each of the client's property types → the idealista type it is sent as.
// "Automatic" = the parent type's choice, else a guess from the name.
export function IdealistaTypesTable({
  types,
  options,
  onSaved,
}: {
  types: IdealistaTypeRow[];
  options: IdealistaTypeOption[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Record<number, string | null>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(Object.fromEntries(types.map((t) => [t.id, t.idealistaType])));
  }, [types]);

  const labelOf = (value: string | null) => options.find((o) => o.value === value)?.label ?? value ?? '';
  const changed = types.filter((t) => (draft[t.id] ?? null) !== t.idealistaType);
  const unmapped = types.filter((t) => !t.effectiveType && !draft[t.id]).length;

  const save = async () => {
    setSaving(true);
    try {
      await apiPut('/api/dashboard/feed-export/idealista/types', {
        types: changed.map((t) => ({ id: t.id, idealistaType: draft[t.id] ?? null })),
      });
      toast({ title: 'Property type mapping saved' });
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save', description: errorText(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!types.length) {
    return <p className="text-sm text-muted-foreground">No property types yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {unmapped ? `${unmapped} type(s) have no idealista type — their listings are left out.` : 'Every type has an idealista type.'}
        </p>
        <Button size="sm" onClick={save} disabled={saving || !changed.length}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save mapping{changed.length ? ` (${changed.length})` : ''}
        </Button>
      </div>
      <div className="max-h-[420px] overflow-y-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Your property type</TableHead>
              <TableHead>idealista type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((t) => {
              const value = draft[t.id] ?? null;
              const parent = t.parentId ? types.find((p) => p.id === t.parentId)?.name : null;
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    {parent && <div className="text-xs text-muted-foreground">under {parent}</div>}
                  </TableCell>
                  <TableCell className="min-w-[260px]">
                    <Select value={value ?? AUTO} onValueChange={(v) => setDraft({ ...draft, [t.id]: v === AUTO ? null : v })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO}>
                          {t.source && t.source !== 'set' && t.effectiveType
                            ? `Automatic: ${labelOf(t.effectiveType)}`
                            : 'Automatic'}
                        </SelectItem>
                        {options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!value && !t.effectiveType && (
                      <Badge variant="destructive" className="mt-1">Not mapped</Badge>
                    )}
                    {!value && t.effectiveType && t.source && t.source !== 'set' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t.source === 'parent' ? 'From the parent type' : 'Guessed from the name'} — check it
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
