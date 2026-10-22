'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useBuyerText } from '../../_i18n/use-buyer-text';
import { useBuyerAgents, useBuyerSettings, useUpdateBuyerSettings, type BuyerMatchSettings } from '../../use-buyers';
import { FilterSelect } from '../../_components/filter-select';

export function GeneralSettings({ canEdit }: { canEdit: boolean }) {
  const t = useBuyerText();
  const s = t.settingsPage;
  const { toast } = useToast();
  const settings = useBuyerSettings();
  const agents = useBuyerAgents();
  const save = useUpdateBuyerSettings();
  const [draft, setDraft] = useState<BuyerMatchSettings | null>(null);

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  if (settings.isLoading || !draft) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const set = (patch: Partial<BuyerMatchSettings>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  // Weights and URL patterns have their own cards and saves.
  const own = ({ weights: _w, propertyUrlPatterns: _p, ...rest }: BuyerMatchSettings) => rest;
  const dirty = JSON.stringify(own(draft)) !== JSON.stringify(settings.data ? own(settings.data) : null);
  const staleOk = Number.isInteger(draft.staleDays) && draft.staleDays >= 1 && draft.staleDays <= 365;

  const submit = async () => {
    try {
      await save.mutateAsync(own(draft));
      toast({ title: s.saved });
    } catch (err) {
      toast({ title: s.failed, description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <fieldset disabled={!canEdit} className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{s.visibility}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="bm-see-all">{s.agentsSeeAll}</Label>
                <p className="mt-1 text-sm text-muted-foreground">{s.agentsSeeAllHelp}</p>
              </div>
              <Switch id="bm-see-all" checked={draft.agentsSeeAll} onCheckedChange={(v) => set({ agentsSeeAll: v })} disabled={!canEdit} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{s.assignment}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div role="radiogroup" className="space-y-2">
              {(['default', 'round_robin'] as const).map((mode) => (
                <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="bm-assign"
                    checked={draft.assignMode === mode}
                    onChange={() => set({ assignMode: mode })}
                    disabled={!canEdit}
                  />
                  {mode === 'default' ? s.assignDefault : s.assignRoundRobin}
                </label>
              ))}
            </div>
            {draft.assignMode === 'default' ? (
              <div className="space-y-1.5">
                <Label>{s.defaultAgent}</Label>
                <FilterSelect
                  className="w-72"
                  value={draft.defaultAgentId ? String(draft.defaultAgentId) : ''}
                  onChange={(v) => set({ defaultAgentId: v ? Number(v) : null })}
                  anyLabel={s.noAgent}
                  options={(agents.data ?? []).map((a) => ({ value: String(a.id), label: a.name || a.email }))}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{s.rotation}</Label>
                {(agents.data ?? []).map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.rotationAgentIds.includes(a.id)}
                      onCheckedChange={(on) =>
                        set({
                          rotationAgentIds: on
                            ? [...draft.rotationAgentIds, a.id]
                            : draft.rotationAgentIds.filter((id) => id !== a.id),
                        })
                      }
                      disabled={!canEdit}
                    />
                    {a.name || a.email}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{s.stale}</CardTitle>
            <CardDescription>{s.staleDays}</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              min={1}
              max={365}
              className="w-28"
              value={draft.staleDays}
              onChange={(e) => set({ staleDays: Number(e.target.value) })}
            />
          </CardContent>
        </Card>

        <Card data-testid="followup-settings">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{s.followUp}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bm-reminder" className="text-xs font-normal text-muted-foreground">{s.reminderMinutes}</Label>
              <Input id="bm-reminder" type="number" min={0} max={1440} className="w-28" value={draft.viewingReminderMinutes}
                onChange={(e) => set({ viewingReminderMinutes: Math.max(0, Math.min(1440, Math.round(Number(e.target.value) || 0))) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bm-digest" className="text-xs font-normal text-muted-foreground">{s.agentDigestTime}</Label>
              <Input id="bm-digest" type="time" className="w-32" value={draft.agentDigestTime}
                onChange={(e) => e.target.value && set({ agentDigestTime: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bm-hot" className="text-xs font-normal text-muted-foreground">{s.hotScore}</Label>
              <Input id="bm-hot" type="number" min={1} max={50} className="w-28" value={draft.hotScore}
                onChange={(e) => set({ hotScore: Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1))) })} />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!dirty || !staleOk || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {s.save}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
