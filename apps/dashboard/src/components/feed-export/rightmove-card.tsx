'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Save, Send, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { errorText, unwrap } from './idealista-api';
import type { RightmoveCheck, RightmoveOverview, RightmovePushSummary, RightmoveSettings } from './rightmove-api';
import type { ExportStatus } from './export-status';
import { IdealistaListingPicker } from './idealista-listing-picker';
import { IdealistaTypesTable } from './idealista-types-table';
import { RightmoveLog } from './rightmove-log';
import { RightmoveTowns } from './rightmove-towns';

const BASE = '/api/dashboard/feed-export/rightmove';

// Feed Export → Rightmove: the client's own sale listings pushed to Rightmove
// Overseas. Unlike the other feeds there's no URL — SPM sends each change.
export function RightmoveCard({ onStatus }: { onStatus?: (s: ExportStatus) => void }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [overview, setOverview] = useState<RightmoveOverview | null>(null);
  const [settings, setSettings] = useState<RightmoveSettings | null>(null);
  const [check, setCheck] = useState<RightmoveCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [logKey, setLogKey] = useState(0);

  const load = async () => {
    try {
      const data = unwrap<RightmoveOverview>(await apiGet(BASE));
      setOverview(data);
      setSettings(data.settings);
    } catch (err) {
      toast({ title: 'Could not load the Rightmove settings', description: errorText(err), variant: 'destructive' });
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      setCheck(unwrap<RightmoveCheck>(await apiGet(`${BASE}/check`)));
    } catch (err) {
      toast({ title: 'Could not check the listings', description: errorText(err), variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    load();
    runCheck();
  }, [session?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!overview) return;
    const s = overview.settings;
    const problems = (check?.skipped.length ?? 0) + (check?.issues.length ?? 0);
    onStatus?.(!s.enabled || !s.branchId ? 'off' : !overview.live ? 'test' : problems ? 'warn' : 'on');
  }, [overview, check]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const { enabled, networkId, branchId, mode, propertyIds, includeSpanish } = settings;
      await apiPut(BASE, { enabled, networkId, branchId, mode, propertyIds, includeSpanish });
      toast({ title: 'Rightmove settings saved' });
      await load();
      runCheck();
    } catch (err) {
      toast({ title: 'Could not save', description: errorText(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const push = async () => {
    setPushing(true);
    try {
      const r = unwrap<RightmovePushSummary>(await apiPost(`${BASE}/push`));
      const counts = `${r.sent} sent, ${r.removed} removed, ${r.unchanged} unchanged${r.failed ? `, ${r.failed} failed` : ''}`;
      toast({
        title: r.message || (r.dryRun ? 'Dry run finished — nothing reached Rightmove' : 'Pushed to Rightmove'),
        description: r.message ? undefined : r.dryRun ? `Would be: ${counts}` : counts,
        variant: r.failed ? 'destructive' : undefined,
      });
      await load();
      runCheck();
      setLogKey((k) => k + 1);
    } catch (err) {
      toast({ title: 'Could not push', description: errorText(err), variant: 'destructive' });
    } finally {
      setPushing(false);
    }
  };

  if (!overview || !settings) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const set = (patch: Partial<RightmoveSettings>) => setSettings({ ...settings, ...patch });
  const idValue = (v: number | null) => (v == null ? '' : String(v));
  const parseId = (v: string) => {
    const n = parseInt(v.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const problems = (check?.skipped.length ?? 0) + (check?.issues.length ?? 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Rightmove
              <Badge variant={settings.enabled ? 'default' : 'secondary'}>{settings.enabled ? 'On' : 'Off'}</Badge>
              {!overview.live && <Badge variant="outline">Test mode</Badge>}
            </CardTitle>
            <CardDescription>
              Your own sale listings on Rightmove Overseas. SPM sends every change to Rightmove itself, every 30 minutes.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={settings.enabled} onCheckedChange={(v) => set({ enabled: v })} />
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="settings">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="types">Property types</TabsTrigger>
            <TabsTrigger value="towns">Towns</TabsTrigger>
            <TabsTrigger value="listings">Listings</TabsTrigger>
            <TabsTrigger value="check">
              Check
              {!!problems && <Badge variant="destructive" className="ml-2 h-5 px-1.5">{problems}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="log">Push log</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 pt-4">
            {!overview.canSetIds && !settings.networkId && !settings.branchId && (
              <div className="text-sm p-3 rounded-md bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200">
                To go live on Rightmove, ask SPM support to add your Rightmove network and branch ID. Until then you can
                set everything else up and use the Check tab to see what Rightmove would receive.
              </div>
            )}
            {!overview.live && (
              <div className="text-sm p-3 rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Test mode: the Rightmove certificate isn’t installed on the server yet. “Push now” shows what would be sent, but nothing reaches Rightmove.
              </div>
            )}
            {overview.canSetIds ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Rightmove network ID</Label>
                    <Input value={idValue(settings.networkId)} onChange={(e) => set({ networkId: parseId(e.target.value) })} inputMode="numeric" className="font-mono" autoComplete="off" />
                  </div>
                  <div className="space-y-2">
                    <Label>Rightmove branch ID</Label>
                    <Input value={idValue(settings.branchId)} onChange={(e) => set({ branchId: parseId(e.target.value) })} inputMode="numeric" className="font-mono" autoComplete="off" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Super Admin only — clients don’t see these fields. Both numbers come from Rightmove for the agency’s branch. Each branch can belong to one client only.
                </p>
              </>
            ) : settings.branchId ? (
              <p className="text-sm text-muted-foreground">
                Connected to your Rightmove branch <span className="font-mono text-foreground">{settings.branchId}</span>. Contact SPM support to change it.
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label>Add the Spanish description</Label>
                <p className="text-xs text-muted-foreground">Rightmove shows English first; the Spanish text follows it in the full description.</p>
              </div>
              <Switch checked={settings.includeSpanish} onCheckedChange={(v) => set({ includeSpanish: v })} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="text-sm space-y-0.5">
                <div><strong>{overview.onRightmove}</strong> listings on Rightmove{overview.withErrors ? `, ${overview.withErrors} with errors` : ''}</div>
                {check && <div className="text-muted-foreground">{check.pending} waiting to be sent</div>}
                {overview.lastActivity && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Last activity {new Date(overview.lastActivity).toLocaleString()}
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={push} disabled={pushing || !settings.enabled}>
                {pushing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Push now
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="types" className="pt-4">
            <IdealistaTypesTable
              types={overview.types}
              options={overview.typeOptions}
              portal="Rightmove"
              saveUrl={`${BASE}/types`}
              field="rightmoveType"
              onSaved={() => { load(); runCheck(); }}
            />
          </TabsContent>

          <TabsContent value="towns" className="pt-4">
            <RightmoveTowns onChanged={runCheck} />
          </TabsContent>

          <TabsContent value="listings" className="space-y-4 pt-4">
            <div className="space-y-2 max-w-md">
              <Label>Which listings are sent</Label>
              <Select value={settings.mode} onValueChange={(v) => set({ mode: v as RightmoveSettings['mode'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">All my own live sale listings</SelectItem>
                  <SelectItem value="selected">Only the listings I pick</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Only your own listings (and ones added by hand) are ever sent. Rightmove Overseas takes sales only — rentals are never sent.
                A listing that is sold, unpublished or unpicked is taken off Rightmove at the next push.
              </p>
            </div>
            {settings.mode === 'selected' && (
              <IdealistaListingPicker ids={settings.propertyIds} onChange={(propertyIds) => set({ propertyIds })} />
            )}
            <p className="text-xs text-muted-foreground">Press Save to apply.</p>
          </TabsContent>

          <TabsContent value="check" className="space-y-4 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <strong>{check?.included ?? '–'}</strong> ready
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <strong>{check?.issues.length ?? '–'}</strong> need attention
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <strong>{check?.skipped.length ?? '–'}</strong> left out
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={runCheck} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Check again
              </Button>
            </div>
            {check?.warnings.map((w) => (
              <div key={w} className="text-sm p-3 rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{w}</div>
            ))}
            {!!check?.skipped.length && (
              <>
                <p className="text-sm font-medium">Left out — Rightmove would reject these</p>
                <div className="border rounded-md max-h-[360px] overflow-y-auto divide-y">
                  {check.skipped.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                      <a href={`/dashboard/properties/${s.id}/edit`} className="font-medium hover:underline">{s.reference}</a>
                      <span className="text-muted-foreground text-right">{s.reason}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!!check?.issues.length && (
              <>
                <p className="text-sm font-medium">Sent, but need attention</p>
                <div className="border rounded-md max-h-[420px] overflow-y-auto divide-y">
                  {check.issues.map((s) => (
                    <div key={s.id} className="flex items-start justify-between gap-3 p-2 text-sm">
                      <a href={`/dashboard/properties/${s.id}/edit`} className="font-medium hover:underline shrink-0">{s.reference}</a>
                      <ul className="text-muted-foreground text-right space-y-0.5">
                        {s.issues.map((i) => <li key={i}>{i}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!!check?.sample && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">What Rightmove receives (first listing)</summary>
                <pre className="mt-2 max-h-[360px] overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(check.sample, null, 2)}</pre>
              </details>
            )}
          </TabsContent>

          <TabsContent value="log" className="pt-4">
            <RightmoveLog refreshKey={logKey} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
