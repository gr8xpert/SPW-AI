'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerSettings, useUpdateBuyerSettings, type BuyerMatchSettings } from '../../use-buyers';

type NearMiss = BuyerMatchSettings['nearMiss'];

// Near-miss thresholds (milestone G). New-listing alerts sit below (H).
export function NearMissSettings({ canEdit }: { canEdit: boolean }) {
  const s = useBuyerText().settingsPage.nearMiss;
  const fail = useBuyerText().settingsPage.failed;
  const { toast } = useToast();
  const settings = useBuyerSettings();
  const save = useUpdateBuyerSettings();
  const [draft, setDraft] = useState<NearMiss | null>(null);

  useEffect(() => {
    if (settings.data?.nearMiss) setDraft({ ...settings.data.nearMiss });
  }, [settings.data]);
  if (!draft) return null;

  const saved = settings.data?.nearMiss;
  const dirty = !!saved && (saved.enabled !== draft.enabled || saved.budgetPercent !== draft.budgetPercent || saved.nearbyKm !== draft.nearbyKm);
  const submit = async () => {
    try {
      await save.mutateAsync({ nearMiss: draft });
      toast({ title: s.saved });
    } catch (err) {
      toast({ title: fail, description: (err as Error).message, variant: 'destructive' });
    }
  };
  const n = (v: string, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));

  return (
    <Card className="max-w-3xl" data-testid="near-miss-settings">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{s.title}</CardTitle>
        <CardDescription>{s.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} aria-label={s.enabled} />
            {s.enabled}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nm-budget">{s.budget}</Label>
              <Input id="nm-budget" type="number" min={0} max={50} value={draft.budgetPercent} onChange={(e) => setDraft({ ...draft, budgetPercent: n(e.target.value, 50) })} disabled={!draft.enabled} />
              <p className="text-xs text-muted-foreground">{s.zeroOff}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nm-km">{s.km}</Label>
              <Input id="nm-km" type="number" min={0} max={100} value={draft.nearbyKm} onChange={(e) => setDraft({ ...draft, nearbyKm: n(e.target.value, 100) })} disabled={!draft.enabled} />
              <p className="text-xs text-muted-foreground">{s.zeroOff}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!dirty || save.isPending} data-testid="near-miss-save">
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {s.save}
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

type Alerts = BuyerMatchSettings['alerts'];

// New-listing / price-drop alerts (milestone H).
export function AlertSettings({ canEdit }: { canEdit: boolean }) {
  const s = useBuyerText().settingsPage.alerts;
  const fail = useBuyerText().settingsPage.failed;
  const { toast } = useToast();
  const settings = useBuyerSettings();
  const save = useUpdateBuyerSettings();
  const [draft, setDraft] = useState<Alerts | null>(null);

  useEffect(() => {
    if (settings.data?.alerts) setDraft({ ...settings.data.alerts });
  }, [settings.data]);
  if (!draft) return null;

  const saved = settings.data?.alerts;
  const dirty = !!saved && (Object.keys(draft) as (keyof Alerts)[]).some((k) => saved[k] !== draft[k]);
  const submit = async () => {
    try {
      await save.mutateAsync({ alerts: draft });
      toast({ title: s.saved });
    } catch (err) {
      toast({ title: fail, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card className="max-w-3xl" data-testid="alert-settings">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{s.title}</CardTitle>
        <CardDescription>{s.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} aria-label={s.enabled} data-testid="alerts-enabled" />
            {s.enabled}
          </label>
          <div className="space-y-2">
            <Label>{s.delivery}</Label>
            {(['digest', 'instant'] as const).map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input type="radio" name="alert-delivery" checked={draft.delivery === d} onChange={() => setDraft({ ...draft, delivery: d })} disabled={!draft.enabled} />
                {s[d]}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="al-time">{s.digestTime}</Label>
              <Input id="al-time" type="time" value={draft.digestTime} onChange={(e) => e.target.value && setDraft({ ...draft, digestTime: e.target.value })} disabled={!draft.enabled || draft.delivery !== 'digest'} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="al-drop">{s.drop}</Label>
              <Input
                id="al-drop"
                type="number"
                min={1}
                max={90}
                value={draft.priceDropPercent}
                onChange={(e) => setDraft({ ...draft, priceDropPercent: Math.min(90, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
                disabled={!draft.enabled}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!dirty || save.isPending} data-testid="alerts-save">
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {s.save}
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
