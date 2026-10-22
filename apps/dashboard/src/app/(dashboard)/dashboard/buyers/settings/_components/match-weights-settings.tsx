'use client';

import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerSettings, useUpdateBuyerSettings, type BuyerMatchWeights } from '../../use-buyers';
import { nameOf, useMatchOptions } from '../../use-buyer-match';
import { FilterSelect } from '../../_components/filter-select';

const BASE = ['bedrooms', 'bathrooms', 'buildSize', 'plotSize', 'feature'] as const;
const clamp = (v: string) => Math.min(10, Math.max(0, Math.round(Number(v) || 0)));

// How much each wish counts in a match score, with own weights per feature.
export function MatchWeightsSettings({ canEdit }: { canEdit: boolean }) {
  const s = useBuyerText().settingsPage;
  const w = s.weights;
  const { toast } = useToast();
  const settings = useBuyerSettings();
  const features = useMatchOptions('features');
  const save = useUpdateBuyerSettings();
  const [draft, setDraft] = useState<BuyerMatchWeights | null>(null);
  const [pick, setPick] = useState('');

  useEffect(() => {
    if (settings.data) setDraft(settings.data.weights);
  }, [settings.data]);

  if (!draft) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.data?.weights);
  const overrides = Object.entries(draft.featureOverrides);
  const setOverride = (id: string, v: number | null) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d.featureOverrides };
      if (v === null) delete next[id];
      else next[id] = v;
      return { ...d, featureOverrides: next };
    });

  const submit = async () => {
    try {
      await save.mutateAsync({ weights: draft });
      toast({ title: w.saved });
    } catch (err) {
      toast({ title: w.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card className="max-w-3xl" data-testid="match-weights">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{s.tabs.weights}</CardTitle>
        <CardDescription>{w.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {BASE.map((k) => (
              <div key={k} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <Label htmlFor={`w-${k}`}>{w[k]}</Label>
                <Input
                  id={`w-${k}`}
                  type="number"
                  min={0}
                  max={10}
                  className="h-8 w-20"
                  value={draft[k]}
                  onChange={(e) => setDraft((d) => (d ? { ...d, [k]: clamp(e.target.value) } : d))}
                />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>{w.overrides}</Label>
            <p className="text-xs text-muted-foreground">{w.overridesHelp}</p>
            {overrides.map(([id, v]) => (
              <div key={id} className="flex items-center gap-3">
                <span className="min-w-[180px] text-sm">{nameOf(features.data?.find((f) => String(f.id) === id)?.name) || `#${id}`}</span>
                <Input type="number" min={0} max={10} className="h-8 w-20" value={v} onChange={(e) => setOverride(id, clamp(e.target.value))} aria-label={`weight ${id}`} />
                <Button type="button" variant="ghost" size="sm" onClick={() => setOverride(id, null)} aria-label={w.remove}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <FilterSelect
                className="w-[240px]"
                value={pick}
                onChange={setPick}
                anyLabel={w.pickFeature}
                options={(features.data ?? [])
                  .filter((f) => draft.featureOverrides[String(f.id)] === undefined)
                  .map((f) => ({ value: String(f.id), label: nameOf(f.name) }))}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pick}
                onClick={() => {
                  setOverride(pick, Math.min(10, draft.feature + 2));
                  setPick('');
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                {w.addOverride}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!dirty || save.isPending} data-testid="weights-save">
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {w.save}
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
