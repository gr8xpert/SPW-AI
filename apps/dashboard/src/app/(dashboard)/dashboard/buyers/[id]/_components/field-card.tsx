'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useUpdateBuyer, type Buyer, type UpdateBuyerInput } from '../../use-buyers';

export type FieldDef = {
  key: keyof UpdateBuyerInput & string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'date' | 'url';
  // Custom input instead of a text box (select, textarea…).
  render?: (value: string, set: (v: string) => void) => React.ReactNode;
  wide?: boolean;
  maxLength?: number;
};

// Form values are strings; '' clears a field on the API side.
export function toFormValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 10) : s;
}

// A card of fields with its own Save: sends only the fields that changed.
export function FieldCard({
  buyer,
  title,
  description,
  fields,
  initial,
  validate,
}: {
  buyer: Buyer;
  title: string;
  description?: string;
  fields: FieldDef[];
  // Values to start from when they don't live on buyer[key] (e.g. email).
  initial?: Partial<Record<string, string>>;
  validate?: (draft: Record<string, string>) => string | null;
}) {
  const t = useBuyerText();
  const { toast } = useToast();
  const update = useUpdateBuyer(buyer.id);

  const original = useMemo(
    () =>
      Object.fromEntries(
        fields.map((f) => [f.key, initial?.[f.key] ?? toFormValue((buyer as unknown as Record<string, unknown>)[f.key])]),
      ) as Record<string, string>,
    [buyer, fields, initial],
  );
  const [draft, setDraft] = useState(original);
  useEffect(() => setDraft(original), [original]);

  const changed = fields.filter((f) => draft[f.key] !== original[f.key]);
  const error = validate?.(draft) ?? null;

  const save = async () => {
    const body: Record<string, unknown> = {};
    for (const f of changed) {
      const v = draft[f.key].trim();
      body[f.key] = f.type === 'number' ? (v === '' ? null : Number(v)) : v;
    }
    try {
      await update.mutateAsync(body as UpdateBuyerInput);
      toast({ title: t.record.saved });
    } catch (err) {
      toast({ title: t.record.saveFailed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => {
            const value = draft[f.key] ?? '';
            const set = (v: string) => setDraft((d) => ({ ...d, [f.key]: v }));
            const id = `bf-${buyer.id}-${f.key}`;
            return (
              <div key={f.key} className={f.wide ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                <Label htmlFor={id}>{f.label}</Label>
                {f.render ? (
                  f.render(value, set)
                ) : (
                  <Input
                    id={id}
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                    value={value}
                    maxLength={f.maxLength}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={!changed.length || !!error || update.isPending}>
            {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {update.isPending ? t.record.saving : t.record.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
