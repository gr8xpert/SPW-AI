'use client';

import { useEffect, useRef, useState } from 'react';
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
import type { RightmoveCheck, RightmoveOverview, RightmovePushStatus, RightmoveSettings } from './rightmove-api';
import type { ExportStatus } from './export-status';
import { IdealistaListingPicker } from './idealista-listing-picker';
import { IdealistaTypesTable } from './idealista-types-table';
import { RightmoveLog } from './rightmove-log';
import { RightmoveTowns } from './rightmove-towns';
import { runErrorText } from './feed-run-button';
import { spainDateTime } from './spain-time';
import { useLanguage } from '@/i18n/i18n-provider';
import { useFeedExportText } from './_i18n';

const BASE = '/api/dashboard/feed-export/rightmove';

// Feed Export → Rightmove: the client's own sale listings pushed to Rightmove
// Overseas. Unlike the other feeds there's no URL — SPM sends each change.
export function RightmoveCard({ onStatus }: { onStatus?: (s: ExportStatus) => void }) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const t = useFeedExportText();
  const { locale } = useLanguage();
  const fail = (err: unknown) => errorText(err, t.common.somethingWrong);
  const [overview, setOverview] = useState<RightmoveOverview | null>(null);
  const [settings, setSettings] = useState<RightmoveSettings | null>(null);
  const [check, setCheck] = useState<RightmoveCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  // A push runs in the background, and the schedule's own runs count too.
  const [pushing, setPushing] = useState(false);
  const announceResult = useRef(false);
  const [logKey, setLogKey] = useState(0);

  const load = async () => {
    try {
      const data = unwrap<RightmoveOverview>(await apiGet(BASE));
      setOverview(data);
      setSettings(data.settings);
    } catch (err) {
      toast({ title: t.rightmove.loadFailed, description: fail(err), variant: 'destructive' });
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      setCheck(unwrap<RightmoveCheck>(await apiGet(`${BASE}/check`)));
    } catch (err) {
      toast({ title: t.rightmove.checkFailed, description: fail(err), variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!session?.accessToken) return;
    load();
    runCheck();
    apiGet(`${BASE}/push/status`)
      .then((res) => setPushing(unwrap<RightmovePushStatus>(res).running))
      .catch(() => undefined);
  }, [session?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follows a running push until it ends, then shows how it went.
  useEffect(() => {
    if (!pushing) return;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const status = unwrap<RightmovePushStatus>(await apiGet(`${BASE}/push/status`));
        if (status.running) return;
        clearInterval(timer);
        setPushing(false);
        if (announceResult.current) showResult(status.lastRun);
        announceResult.current = false;
        setLogKey((k) => k + 1);
        await load();
        runCheck();
      } catch {
        // A failed check is not a failed push: try again on the next tick.
      } finally {
        busy = false;
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [pushing]); // eslint-disable-line react-hooks/exhaustive-deps

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
      toast({ title: t.rightmove.saved });
      await load();
      runCheck();
    } catch (err) {
      toast({ title: t.common.couldNotSave, description: fail(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const showResult = (run: RightmovePushStatus['lastRun']) => {
    if (!run) return;
    const c = run.summary;
    const counts = c ? t.rightmove.pushCounts(c.sent, c.removed, c.unchanged, c.failed) : '';
    if (!run.success && !c?.failed) {
      toast({ title: t.rightmove.pushFailed, description: run.message ?? undefined, variant: 'destructive' });
      return;
    }
    toast({
      title: run.dryRun ? t.rightmove.dryRunDone : run.success ? t.rightmove.pushed : t.rightmove.pushFailed,
      description: run.dryRun ? t.rightmove.wouldBe(counts) : counts,
      variant: run.success ? undefined : 'destructive',
    });
  };

  const push = async () => {
    setStarting(true);
    try {
      await apiPost(`${BASE}/push`);
      announceResult.current = true;
      setPushing(true);
    } catch (err) {
      toast({ title: t.rightmove.pushFailed, description: runErrorText(err, t), variant: 'destructive' });
    } finally {
      setStarting(false);
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
  // Saved state only: the run uses what is saved, not unsaved edits.
  const saved = overview.settings;
  const canPush = saved.enabled && !!saved.networkId && !!saved.branchId;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2">
              Rightmove
              <Badge variant={settings.enabled ? 'default' : 'secondary'}>{settings.enabled ? t.common.on : t.common.off}</Badge>
              {!overview.live && <Badge variant="outline">{t.common.testMode}</Badge>}
            </CardTitle>
            <CardDescription>{t.rightmove.description}</CardDescription>
            {!canPush && (
              <p className="text-xs text-muted-foreground mt-1">{saved.enabled ? t.run.needIds : t.run.offHint}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Switch checked={settings.enabled} onCheckedChange={(v) => set({ enabled: v })} />
            <Button variant="outline" onClick={push} disabled={starting || pushing || !canPush}>
              {starting || pushing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {t.rightmove.pushNow}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {t.common.save}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="settings">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="settings">{t.common.settings}</TabsTrigger>
            <TabsTrigger value="types">{t.common.propertyTypes}</TabsTrigger>
            <TabsTrigger value="towns">{t.rightmove.towns}</TabsTrigger>
            <TabsTrigger value="listings">{t.common.listings}</TabsTrigger>
            <TabsTrigger value="check">
              {t.rightmove.check}
              {!!problems && <Badge variant="destructive" className="ml-2 h-5 px-1.5">{problems}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="log">{t.rightmove.pushLog}</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 pt-4">
            {!overview.canSetIds && !settings.networkId && !settings.branchId && (
              <div className="text-sm p-3 rounded-md bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200">
                {t.rightmove.askSupport}
              </div>
            )}
            {!overview.live && (
              <div className="text-sm p-3 rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {t.rightmove.testModeNote}
              </div>
            )}
            {overview.canSetIds ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t.rightmove.networkId}</Label>
                    <Input value={idValue(settings.networkId)} onChange={(e) => set({ networkId: parseId(e.target.value) })} inputMode="numeric" className="font-mono" autoComplete="off" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t.rightmove.branchId}</Label>
                    <Input value={idValue(settings.branchId)} onChange={(e) => set({ branchId: parseId(e.target.value) })} inputMode="numeric" className="font-mono" autoComplete="off" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.rightmove.idsHelp}
                </p>
              </>
            ) : settings.branchId ? (
              <p className="text-sm text-muted-foreground">
                {t.rightmove.connectedBefore}<span className="font-mono text-foreground">{settings.branchId}</span>{t.rightmove.connectedAfter}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <Label>{t.rightmove.spanish}</Label>
                <p className="text-xs text-muted-foreground">{t.rightmove.spanishHelp}</p>
              </div>
              <Switch checked={settings.includeSpanish} onCheckedChange={(v) => set({ includeSpanish: v })} />
            </div>
            <div className="rounded-md border p-3">
              <div className="text-sm space-y-0.5">
                <div><strong>{overview.onRightmove}</strong> {t.rightmove.onRightmove}{overview.withErrors ? t.rightmove.withErrors(overview.withErrors) : ''}</div>
                {check && <div className="text-muted-foreground">{t.rightmove.waiting(check.pending)}</div>}
                {overview.lastActivity && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {t.rightmove.lastActivity(spainDateTime(overview.lastActivity, locale))}
                  </div>
                )}
              </div>
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
              <Label>{t.common.whichListingsSent}</Label>
              <Select value={settings.mode} onValueChange={(v) => set({ mode: v as RightmoveSettings['mode'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">{t.rightmove.allOwnSale}</SelectItem>
                  <SelectItem value="selected">{t.common.onlyPicked}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t.rightmove.listingsHelp}</p>
            </div>
            {settings.mode === 'selected' && (
              <IdealistaListingPicker portal="Rightmove" ids={settings.propertyIds} onChange={(propertyIds) => set({ propertyIds })} />
            )}
            <p className="text-xs text-muted-foreground">{t.common.pressSave}</p>
          </TabsContent>

          <TabsContent value="check" className="space-y-4 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <strong>{check?.included ?? '–'}</strong> {t.rightmove.ready}
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <strong>{check?.issues.length ?? '–'}</strong> {t.common.needAttention}
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <strong>{check?.skipped.length ?? '–'}</strong> {t.common.leftOut}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={runCheck} disabled={checking}>
                {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {t.common.checkAgain}
              </Button>
            </div>
            {check?.warnings.map((w) => (
              <div key={w} className="text-sm p-3 rounded-md bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{w}</div>
            ))}
            {!!check?.skipped.length && (
              <>
                <p className="text-sm font-medium">{t.rightmove.leftOutTitle}</p>
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
                <p className="text-sm font-medium">{t.rightmove.issuesTitle}</p>
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
                <summary className="cursor-pointer text-muted-foreground">{t.rightmove.sample}</summary>
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
