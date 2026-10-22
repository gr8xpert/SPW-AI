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
  const [pushing, setPushing] = useState(false);
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
      toast({ title: t.rightmove.saved });
      await load();
      runCheck();
    } catch (err) {
      toast({ title: t.common.couldNotSave, description: fail(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const push = async () => {
    setPushing(true);
    try {
      const r = unwrap<RightmovePushSummary>(await apiPost(`${BASE}/push`));
      const counts = t.rightmove.pushCounts(r.sent, r.removed, r.unchanged, r.failed);
      toast({
        title: r.message || (r.dryRun ? t.rightmove.dryRunDone : t.rightmove.pushed),
        description: r.message ? undefined : r.dryRun ? t.rightmove.wouldBe(counts) : counts,
        variant: r.failed ? 'destructive' : undefined,
      });
      await load();
      runCheck();
      setLogKey((k) => k + 1);
    } catch (err) {
      toast({ title: t.rightmove.pushFailed, description: fail(err), variant: 'destructive' });
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
              <Badge variant={settings.enabled ? 'default' : 'secondary'}>{settings.enabled ? t.common.on : t.common.off}</Badge>
              {!overview.live && <Badge variant="outline">{t.common.testMode}</Badge>}
            </CardTitle>
            <CardDescription>{t.rightmove.description}</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={settings.enabled} onCheckedChange={(v) => set({ enabled: v })} />
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
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="text-sm space-y-0.5">
                <div><strong>{overview.onRightmove}</strong> {t.rightmove.onRightmove}{overview.withErrors ? t.rightmove.withErrors(overview.withErrors) : ''}</div>
                {check && <div className="text-muted-foreground">{t.rightmove.waiting(check.pending)}</div>}
                {overview.lastActivity && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {t.rightmove.lastActivity(new Date(overview.lastActivity).toLocaleString(locale))}
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={push} disabled={pushing || !settings.enabled}>
                {pushing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                {t.rightmove.pushNow}
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
              <IdealistaListingPicker ids={settings.propertyIds} onChange={(propertyIds) => set({ propertyIds })} />
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
